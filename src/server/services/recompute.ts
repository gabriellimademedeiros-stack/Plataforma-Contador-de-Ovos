/**
 * recomputeHouseDay (Partes 14.21 e 16): recalcula os indicadores de um dia e avalia os alertas.
 *  - Dia completo (anterior ao dia produtivo corrente): grava daily_metrics do galpão, semanal da semana,
 *    granja do dia e da semana, e avalia as regras diárias (e as semanais aos domingos).
 *  - Dia corrente (parcial): não grava indicadores (a data de referência continua sendo o último dia completo);
 *    avalia só a regra de mortalidade (A06, que depende do apontamento do campo) e as regras de tempo real
 *    (A02, A08h e A11 com os dados horários do dia).
 * Novos alertas geram notificação, pergunta ao encarregado (quando cabe) e hipóteses do motor de causas.
 */
import "server-only";
import { getSql } from "@/db/client";
import { addDays, currentProductiveDate, farmInstant, farmLocalParts, productiveDate, weekStart } from "@/lib/dates";
import { TENANT_ID, houseIdFor } from "@/lib/ids";
import { computeAllMetrics } from "@/engine/metrics/pipeline";
import { buildRuleContext, defaultParams } from "@/engine/alerts/context";
import { DAILY_RULES, makeAlert, newState, runDay, type EngineAlert, type EngineState } from "@/engine/alerts/engine";
import { computeCusum, evalCondition, evalNormal, type RuleContext } from "@/engine/alerts/conditions";
import { evalA02, evalA08h, evalA11Hourly, type HourValue } from "@/engine/alerts/live";
import { QUESTION_RULES, RULE_BY_CODE } from "@/engine/alerts/rules";
import { questionFor } from "@/engine/alerts/questions";
import { loadDataset, loadInternalStandards, loadStrainStandards } from "@/server/repositories/dataset-loader";
import { dailyMetricRows, farmDailyRows, farmWeeklyRows, weeklyMetricRows } from "@/server/repositories/metrics-writer";
import { alertRow } from "@/server/repositories/alert-writer";
import { recomputeAlertInsights } from "./alert-insights";

type Sql = ReturnType<typeof getSql>;
const d10 = (v: unknown) => (v == null ? null : typeof v === "string" ? v.slice(0, 10) : (v as Date).toISOString().slice(0, 10));
const OPEN = ["aberto", "reconhecido", "em_investigacao"];
const LIVE_RULES = ["A02", "A08h"] as const;

export interface RecomputeResult {
  house: string;
  date: string;
  partial: boolean;
  ms: number;
  opened: Array<{ id: string; rule: string; house: string | null; title: string; severity: string }>;
  updated: number;
  wroteMetrics: boolean;
}

async function rulesConfig(sql: Sql) {
  const rows = await sql`select code, params, active from app.alert_rules`;
  const params = defaultParams();
  const active = new Set<string>();
  for (const r of rows) {
    params[r.code] = { ...(params[r.code] ?? {}), ...((r.params as Record<string, number>) ?? {}) };
    if (r.active) active.add(r.code);
  }
  return { params, active };
}

function fromDb(r: Record<string, unknown>): EngineAlert {
  const ev = (r.evidence ?? {}) as Record<string, unknown>;
  return {
    id: r.id as string,
    rule: r.rule_code as string,
    house: (r.house as string) ?? null,
    flock: (r.flock as string) ?? null,
    metric: (r.metric_code as string) ?? null,
    anomalyType: r.anomaly_type as string,
    firstDeviationOn: d10(r.first_deviation_on)!,
    openedOn: d10(r.opened_on)!,
    lastSeenOn: d10(r.last_seen_on)!,
    conditionClearedOn: (ev.condition_cleared_on as string) ?? null,
    closedOn: d10(r.closed_on),
    severity: r.severity as string,
    title: r.title as string,
    observed: (r.observed ?? {}) as Record<string, unknown>,
    evidence: { ...ev },
    reopenedCount: Number(r.reopened_count ?? 0),
    source: r.source as EngineAlert["source"],
    frozenRef: ev.frozen_ref == null ? null : Number(ev.frozen_ref),
  };
}

/** Estado do motor a partir do banco: alertas abertos, fechados recentes (reabertura em 48 h), silêncios e sequências. */
async function stateFromDb(sql: Sql, ctx: RuleContext, d: string, lookback = 7): Promise<{ state: EngineState; snapshot: Map<string, string> }> {
  const state = newState();
  const rows = await sql`select a.*, h.code as house, f.code as flock from app.alerts a left join app.houses h on h.id = a.house_id left join app.flocks f on f.id = a.flock_id
    where a.status in ('aberto','reconhecido','em_investigacao') or (a.closed_on >= ${addDays(d, -3)}) or (a.silenced_until >= ${d})`;
  const snapshot = new Map<string, string>();
  for (const r of rows) {
    const a = fromDb(r);
    const key = `${a.rule}|${a.house ?? "farm"}`;
    if (OPEN.includes(r.status)) {
      state.open.set(key, a);
      snapshot.set(a.id, JSON.stringify({ l: a.lastSeenOn, s: a.severity, c: a.conditionClearedOn }));
    } else if (r.status === "resolvido") state.closed.push(a);
    if (r.silenced_until && d10(r.silenced_until)! >= d) state.silencedUntil.set(key, d10(r.silenced_until)!);
  }
  // sequências de dias com a condição (persistência) e de dias normais (normalização), olhando para trás
  for (const house of ctx.store.houses) {
    for (const rule of DAILY_RULES) {
      const key = `${rule}|${house}`;
      const open = state.open.get(key);
      let n = 0;
      let first: string | null = null;
      for (let k = 1; k <= lookback; k++) {
        const day = addDays(d, -k);
        if (day < ctx.store.dateAt(0)) break;
        if (open) {
          if (evalNormal(ctx, rule, house, day, open.frozenRef)) n++;
          else break;
        } else {
          const c = evalCondition(ctx, rule, house, day);
          if (c.hit) {
            n++;
            first = day;
          } else break;
        }
      }
      if (open) state.normalStreak.set(key, n);
      else if (n > 0) state.hitStreak.set(key, { n, first: first! });
    }
  }
  return { state, snapshot };
}

/** Série horária do dia produtivo (slot 0 = 06h) de uma métrica de sensor. */
async function hourly(sql: Sql, houseId: string, metric: string, day: string): Promise<HourValue[]> {
  const a = farmInstant(day, 6).toISOString();
  const b = farmInstant(addDays(day, 1), 6).toISOString();
  const rows = await sql`select ts, value from app.sensor_readings where house_id = ${houseId} and metric_code = ${metric} and ts >= ${a} and ts < ${b} order by ts`;
  const by = new Map<number, number[]>();
  for (const r of rows) {
    const slot = Math.floor((new Date(r.ts).getTime() - Date.parse(a)) / 3_600_000);
    by.set(slot, [...(by.get(slot) ?? []), Number(r.value)]);
  }
  return [...by.entries()].sort((x, y) => x[0] - y[0]).map(([slot, v]) => ({ slot, value: metric === "nut.agua_litros" ? v.reduce((s, x) => s + x, 0) : Math.max(...v) }));
}

async function liveAlerts(sql: Sql, ctx: RuleContext, state: EngineState, today: string, active: Set<string>, params: Record<string, Record<string, number>>, now: Date): Promise<EngineAlert[]> {
  const opened: EngineAlert[] = [];
  const { hour } = farmLocalParts(now);
  const minuteRows = await sql`select h.code as house, e.window_start, sum(e.qty)::int as eggs from app.egg_counts e join app.houses h on h.id = e.house_id
    where e.window_minutes = 1 and e.window_start >= ${new Date(now.getTime() - 130 * 60_000).toISOString()} group by h.code, e.window_start`;
  for (const house of ctx.store.houses) {
    const flock = ctx.store.flockAt(house, addDays(today, -1)) ?? null;
    if (!flock) continue;
    const hid = houseIdFor(house);
    const consider = (rule: string, c: ReturnType<typeof evalA02>) => {
      if (!active.has(rule) || !c.hit) return;
      const key = `${rule}|${house}`;
      const sil = state.silencedUntil.get(key);
      if (sil && today <= sil) return;
      const open = state.open.get(key);
      if (open) {
        open.lastSeenOn = today;
        if (c.critical && open.severity !== "critica") open.severity = "critica";
        return;
      }
      const a = makeAlert(rule, house, flock, today, today, c, "ao_vivo");
      a.id = `${a.id.slice(0, 24)}${Date.now().toString(16).slice(-12).padStart(12, "0")}`;
      if (rule === "A11" && c.critical) a.severity = "critica";
      state.open.set(key, a);
      opened.push(a);
    };
    // A08h — água do dia
    const water = await hourly(sql, hid, "nut.agua_litros", today);
    if (water.length) {
      const prev: HourValue[][] = [];
      for (let k = 1; k <= (params.A08h?.base_days ?? 7); k++) prev.push(await hourly(sql, hid, "nut.agua_litros", addDays(today, -k)));
      consider("A08h", evalA08h(water, prev, params.A08h as never));
    }
    // A11 com os dados horários do dia
    const temps = await hourly(sql, hid, "amb.temp_interna", today);
    if (temps.length) consider("A11", evalA11Hourly(temps, params.A11 as never));
    // A02 — esteira sem fluxo (mensagens por minuto)
    const mins = minuteRows.filter((r) => r.house === house).map((r) => ({ ts: new Date(r.window_start).toISOString(), eggs: Number(r.eggs) }));
    if (mins.length) consider("A02", evalA02(mins, now, hour, params.A02 as never));
  }
  return opened;
}

async function followUps(sql: Sql, alerts: EngineAlert[]) {
  for (const a of alerts) {
    await sql`insert into app.notifications (tenant_id, user_id, alert_id, house_id, kind, title, body, link)
      values (${TENANT_ID}, null, ${a.id}, ${a.house ? houseIdFor(a.house) : null}, 'alerta', ${a.title}, ${`Regra ${a.rule} · ${a.house ?? "granja"} · ${a.source === "ao_vivo" ? "ao vivo" : "avaliação diária"}`}, ${`/alertas/${a.id}`})`;
    if (!a.house || !QUESTION_RULES.includes(a.rule)) continue;
    const [ev] = await sql`select 1 from app.events e join app.event_scopes s on s.event_id = e.id join app.houses h on h.id = s.house_id
      where h.code = ${a.house} and e.starts_at >= ${farmInstant(addDays(a.firstDeviationOn, -7), 6).toISOString()} and e.type_code not like 'detectado.%' and e.certainty <> 'descartado' limit 1`;
    if (ev) continue;
    const q = questionFor(a.anomalyType, a.house);
    if (!q) continue;
    const [e] = await sql`insert into app.events (tenant_id, type_code, title, starts_at, severity, certainty, description, details, source, completeness)
      values (${TENANT_ID}, 'detectado.nao_explicado', ${`Anomalia sem causa registrada: ${a.title}`}, ${farmInstant(a.firstDeviationOn, 6).toISOString()}, 'media', 'suspeito',
      'Criado pela plataforma: alerta aberto sem evento registrado no escopo.', ${JSON.stringify({ alert_id: a.id })}::jsonb, 'plataforma', 'incompleto') returning id`;
    await sql`insert into app.event_scopes (event_id, house_id, flock_id) select ${e.id}, h.id, f.id from app.houses h left join app.flocks f on f.code = ${a.flock} where h.code = ${a.house}`;
    await sql`insert into app.event_certainty_history (event_id, from_certainty, to_certainty, note) values (${e.id}, null, 'suspeito', 'criado pela plataforma')`;
    await sql`insert into app.event_links (event_id, alert_id) values (${e.id}, ${a.id}) on conflict do nothing`;
    await sql`insert into app.anomaly_questions (tenant_id, alert_id, house_id, question, options) values (${TENANT_ID}, ${a.id}, ${houseIdFor(a.house)}, ${q.question}, ${JSON.stringify(q.options.map((o) => ({ code: o.code, label: o.label })))}::jsonb)`;
  }
}

async function writeMetrics(sql: Sql, m: ReturnType<typeof computeAllMetrics>, house: string, date: string) {
  const at = new Date().toISOString();
  const hid = houseIdFor(house);
  const ws = weekStart(date);
  const daily = dailyMetricRows(m.store, at).filter((r) => r.house_id === hid && r.date === date);
  const weekly = weeklyMetricRows(m.weekly, at).filter((r) => r.house_id === hid && r.week_start === ws);
  const fd = farmDailyRows(m.farmDaily, at).filter((r) => r.date === date);
  const fw = farmWeeklyRows(m.farmWeekly, at).filter((r) => r.week_start === ws);
  // sem mudança nos valores do dia: não regrava (preserva computed_at e o aviso de "dados corrigidos" dos relatórios)
  const existing = await sql`select metric_code, value from app.daily_metrics where house_id = ${hid} and date = ${date}`;
  const ex = new Map(existing.map((r) => [r.metric_code as string, r.value == null ? null : Number(r.value)]));
  const same = existing.length === daily.length && daily.every((r) => {
    const a = ex.get(r.metric_code as string);
    const b = r.value as number | null;
    return a === undefined ? false : a == null || b == null ? a === b : Math.abs(a - b) < 1e-6;
  });
  if (same) return false;
  await sql.begin(async (tx) => {
    await tx`delete from app.daily_metrics where house_id = ${hid} and date = ${date}`;
    if (daily.length) await tx`insert into app.daily_metrics ${tx(daily as never)}`;
    await tx`delete from app.weekly_metrics where house_id = ${hid} and week_start = ${ws}`;
    if (weekly.length) await tx`insert into app.weekly_metrics ${tx(weekly as never)}`;
    await tx`delete from app.farm_daily_metrics where date = ${date}`;
    if (fd.length) await tx`insert into app.farm_daily_metrics ${tx(fd as never)}`;
    await tx`delete from app.farm_weekly_metrics where week_start = ${ws}`;
    if (fw.length) await tx`insert into app.farm_weekly_metrics ${tx(fw as never)}`;
  });
  return daily.length > 0;
}

export async function recomputeHouseDay(house: string, date: string, opts: { now?: Date; forecastDay?: boolean; writeAllHouses?: boolean } = {}): Promise<RecomputeResult> {
  const t0 = Date.now();
  const sql = getSql();
  const now = opts.now ?? new Date();
  const today = currentProductiveDate(now);
  const partial = date >= today;
  const from = addDays(date, -42);
  const [ds, strainRows, internalRows, cfg] = await Promise.all([loadDataset(sql, { from, to: date }), loadStrainStandards(sql), loadInternalStandards(sql), rulesConfig(sql)]);
  const m = computeAllMetrics(ds, { strainRows, internalRows, from, to: date });
  let wrote = false;
  if (!partial) {
    for (const h of opts.writeAllHouses ? ds.houses.map((x) => x.code) : [house]) wrote = (await writeMetrics(sql, m, h, date)) || wrote;
  }
  const ctx = buildRuleContext(ds, m, cfg.params);
  // CUSUM da queda lenta (A05) em sequência nas últimas 5 semanas
  ctx.cusum = new Map(ctx.store.houses.map((h) => [h, computeCusum(ctx, h, addDays(date, -35), date)]));
  const { state, snapshot } = await stateFromDb(sql, ctx, date);
  // dia parcial: só a A06 entre as regras diárias (as demais dependem do dia inteiro)
  if (partial) for (const h of ctx.store.houses) for (const r of DAILY_RULES) if (r !== "A06") state.silencedUntil.set(`${r}|${h}`, date);
  for (const r of [...DAILY_RULES, "A04", "A22", "P01"]) if (!cfg.active.has(r)) for (const h of [...ctx.store.houses, "farm"]) state.silencedUntil.set(`${r}|${h}`, "9999-12-31");
  const opened = runDay(ctx, date, state, { autoClose: false, source: partial ? "ao_vivo" : "diario", forecastDay: opts.forecastDay ? date : undefined }).filter((a) => cfg.active.has(a.rule));
  if (partial) {
    // o silêncio do dia parcial vale só para as regras diárias; as de tempo real (inclusive A11 horária) usam os silêncios do banco
    for (const h of ctx.store.houses) for (const r of DAILY_RULES) if (state.silencedUntil.get(`${r}|${h}`) === date) state.silencedUntil.delete(`${r}|${h}`);
    opened.push(...(await liveAlerts(sql, ctx, state, date, cfg.active, cfg.params, now)));
  }

  // grava: novos alertas, reabertos e atualizações dos abertos
  const newIds = new Set(opened.map((a) => a.id));
  let updated = 0;
  for (const a of opened) {
    const r = alertRow(a);
    await sql`insert into app.alerts (id, tenant_id, rule_code, house_id, flock_id, metric_code, anomaly_type, first_deviation_on, opened_on, opened_at, last_seen_on, status, severity, title, observed, evidence, hypotheses, similar_cases, reopened_count, source)
      values (${r.id as string}, ${r.tenant_id as string}, ${r.rule_code as string}, ${r.house_id as string | null}, ${r.flock_id as string | null}, ${r.metric_code as string | null}, ${r.anomaly_type as string},
        ${r.first_deviation_on as string}, ${r.opened_on as string}, ${now.toISOString()}, ${r.last_seen_on as string}, 'aberto', ${r.severity as string}, ${r.title as string},
        ${JSON.stringify(r.observed)}::jsonb, ${JSON.stringify(r.evidence)}::jsonb, '[]'::jsonb, '[]'::jsonb, 0, ${r.source as string})
      on conflict (id) do nothing`;
  }
  for (const a of state.open.values()) {
    if (newIds.has(a.id)) continue;
    const before = snapshot.get(a.id);
    const after = JSON.stringify({ l: a.lastSeenOn, s: a.severity, c: a.conditionClearedOn });
    if (before === after) continue;
    updated++;
    if (!before) {
      // reaberto (condição voltou em até 48 h)
      await sql`update app.alerts set status = 'aberto', closed_on = null, resolved_at = null, last_seen_on = ${a.lastSeenOn}, reopened_count = ${a.reopenedCount}, evidence = ${JSON.stringify({ ...a.evidence, frozen_ref: a.frozenRef })}::jsonb where id = ${a.id}`;
    } else await sql`update app.alerts set last_seen_on = ${a.lastSeenOn}, severity = ${a.severity}, evidence = ${JSON.stringify({ ...a.evidence, frozen_ref: a.frozenRef })}::jsonb where id = ${a.id}`;
  }
  await followUps(sql, opened);
  for (const a of opened) await recomputeAlertInsights(a.id).catch((e) => console.error("insights", e));
  return { house, date, partial, ms: Date.now() - t0, opened: opened.map((a) => ({ id: a.id, rule: a.rule, house: a.house, title: a.title, severity: a.severity })), updated, wroteMetrics: wrote };
}

/** Dia produtivo de um instante (atalho para as rotas). */
export function productiveDayOf(d: Date = new Date()) {
  return productiveDate(d);
}

export { RULE_BY_CODE, LIVE_RULES };
