import type postgres from "postgres";
import { addDays, farmInstant, lastCompleteWeekStart, weekStart } from "../../src/lib/dates";
import { TENANT_ID, houseIdFor, userIdFor, uuidFromName } from "../../src/lib/ids";
import type { Dataset } from "../../src/engine/types";
import { buildIndex } from "../../src/engine/types";
import type { MetricsResult } from "../../src/engine/metrics/pipeline";
import { buildRuleContext } from "../../src/engine/alerts/context";
import { backtest, type EngineAlert, type EngineState } from "../../src/engine/alerts/engine";
import { groupIncidents, type Incident } from "../../src/engine/alerts/incidents";
import { QUESTION_RULES } from "../../src/engine/alerts/rules";
import { questionFor } from "../../src/engine/alerts/questions";
import type { RuleContext } from "../../src/engine/alerts/conditions";
import { scenarioCatalog, scenarioDates, type ScenarioInfo } from "../../src/simulator/scenarios";
import { demoStateFor, type AlertFinalState } from "../../src/simulator/demo-states";
import { alertRow } from "../../src/server/repositories/alert-writer";
import { insertBatched } from "./db-write";

type Sql = ReturnType<typeof postgres>;

export interface AlertsWorld {
  ctx: RuleContext;
  alerts: EngineAlert[];
  state: EngineState;
  incidents: Incident[];
  alertIncident: Map<string, string>;
  scenarios: ScenarioInfo[];
  states?: Map<string, AlertFinalState>;
  hypotheses?: Map<string, { hypotheses: unknown[]; decomposition: unknown; similar: unknown[]; atOpening: unknown[]; whatToKnow: string[]; text: string }>;
}

export function scenariosFor(ds: Dataset): ScenarioInfo[] {
  const idx = buildIndex(ds);
  const dates = scenarioDates({ dEnd: ds.dEnd, flocksByHouse: idx.flocksByHouse });
  const active = (d: string) => ds.houses.map((h) => h.code).filter((h) => idx.daily.get(h)?.get(d));
  return scenarioCatalog(ds.dEnd, dates, active);
}

/** Passo 8: backtest dia a dia e incidentes. */
export function runBacktest(ds: Dataset, m: MetricsResult): AlertsWorld {
  const ctx = buildRuleContext(ds, m);
  const r = backtest(ctx, addDays(ds.dStart, 30), ds.dEnd, { forecastDay: ds.dEnd });
  const { incidents, alertIncident } = groupIncidents(r.alerts);
  const scenarios = scenariosFor(ds);
  const byRule: Record<string, number> = {};
  for (const a of r.alerts) byRule[a.rule] = (byRule[a.rule] ?? 0) + 1;
  const months = Math.max(1, (new Date(ds.dEnd).getTime() - new Date(addDays(ds.dStart, 30)).getTime()) / (30.4 * 86400000));
  console.log(`\n    ${r.alerts.length} alertas · ${incidents.length} incidentes · por regra: ${Object.entries(byRule).map(([k, v]) => `${k}=${v} (${(v / 8 / months).toFixed(2)}/galpão/mês)`).join(" ")}`);
  return { ctx, alerts: r.alerts, state: r.state, incidents, alertIncident, scenarios };
}

/** Passo 10: estados de demonstração, perguntas, notificações, decisões e anotações. */
export async function applyDemoStatesAndWrite(sql: Sql, ds: Dataset, w: AlertsWorld) {
  const dEnd = ds.dEnd;
  const best = (a: EngineAlert) => {
    const h = w.hypotheses?.get(a.id)?.hypotheses as Array<{ code: string }> | undefined;
    const top = h?.find((x) => x.code === "estresse_termico" || x.code === "resfriamento_insuficiente");
    return top?.code ?? "estresse_termico";
  };
  const states = new Map(w.alerts.map((a) => [a.id, demoStateFor(a, w.scenarios, dEnd, best)]));
  w.states = states;
  const rows = w.alerts.map((a) => {
    const row = alertRow(a, states.get(a.id), w.alertIncident.get(a.id) ?? null);
    const h = w.hypotheses?.get(a.id);
    if (h) {
      row.hypotheses = h.hypotheses;
      row.decomposition = h.decomposition;
      row.similar_cases = h.similar;
      row.evidence = { ...(row.evidence as object), hypotheses_at_opening: h.atOpening, what_to_know: h.whatToKnow, explanation: h.text };
    }
    return row;
  });
  await sql`truncate app.alerts, app.incidents, app.notifications, app.notification_reads, app.anomaly_questions, app.event_links, app.decisions, app.house_notes`;
  await insertBatched(sql, "alerts", rows);
  await insertBatched(
    sql,
    "incidents",
    w.incidents.map((i) => {
      const open = i.alertIds.some((id) => ["aberto", "reconhecido", "em_investigacao"].includes(states.get(id)?.status ?? "aberto"));
      const lastClose = i.alertIds.map((id) => states.get(id)?.closedOn).filter(Boolean).sort().at(-1) ?? null;
      return { id: i.id, tenant_id: TENANT_ID, scope: i.scope, house_id: i.house ? houseIdFor(i.house) : null, title: i.title, opened_on: i.openedOn, closed_on: open ? null : lastClose, status: open ? "aberto" : "fechado" };
    }),
  );

  // ligações evento ↔ alerta para os cenários com evento
  const links: Record<string, unknown>[] = [];
  for (const a of w.alerts) {
    const sc = states.get(a.id)?.scenario;
    if (!sc) continue;
    for (const e of ds.events.filter((x) => x.scenario === sc && (!a.house || x.houses.includes(a.house)))) links.push({ event_id: e.id, alert_id: a.id });
  }
  const uniq = new Map(links.map((l) => [`${l.event_id}|${l.alert_id}`, l]));
  if (uniq.size) await insertBatched(sql, "event_links", [...uniq.values()]);

  // anomalia sem causa + pergunta ao encarregado (alertas abertos sem evento no escopo)
  let questions = 0;
  for (const a of w.alerts) {
    const st = states.get(a.id)!;
    if (st.status !== "aberto" || !a.house || !QUESTION_RULES.includes(a.rule)) continue;
    const hasEvent = ds.events.some((e) => e.houses.includes(a.house!) && e.startDate >= addDays(a.firstDeviationOn, -7) && e.startDate <= dEnd && e.scenario !== "rotina");
    if (hasEvent) continue;
    const q = questionFor(a.anomalyType, a.house);
    if (!q) continue;
    const eventId = uuidFromName(`event:detectado:${a.id}`);
    const at = farmInstant(a.openedOn, 8, 35).toISOString();
    await sql`insert into app.events (id, tenant_id, type_code, title, starts_at, severity, certainty, description, details, source, created_at, completeness)
      values (${eventId}, ${TENANT_ID}, 'detectado.nao_explicado', ${`Anomalia sem causa registrada: ${a.title}`}, ${farmInstant(a.firstDeviationOn, 6).toISOString()}, 'media', 'suspeito',
      'Criado pela plataforma: alerta aberto sem evento registrado no escopo.', ${JSON.stringify({ alert_id: a.id })}::jsonb, 'plataforma', ${at}, 'incompleto')`;
    await sql`insert into app.event_scopes (event_id, house_id, flock_id) select ${eventId}, h.id, f.id from app.houses h left join app.flocks f on f.code = ${a.flock} where h.code = ${a.house}`;
    await sql`insert into app.event_certainty_history (event_id, from_certainty, to_certainty, note, at) values (${eventId}, null, 'suspeito', 'criado pela plataforma', ${at})`;
    await sql`insert into app.event_links (event_id, alert_id) values (${eventId}, ${a.id}) on conflict do nothing`;
    await sql`insert into app.anomaly_questions (tenant_id, alert_id, house_id, question, options, asked_at)
      values (${TENANT_ID}, ${a.id}, ${houseIdFor(a.house)}, ${q.question}, ${JSON.stringify(q.options.map((o) => ({ code: o.code, label: o.label })))}::jsonb, ${at})`;
    questions++;
  }

  // notificações para todos os alertas abertos
  const notif = w.alerts
    .filter((a) => ["aberto", "reconhecido", "em_investigacao"].includes(states.get(a.id)!.status))
    .map((a) => ({
      tenant_id: TENANT_ID,
      user_id: null,
      alert_id: a.id,
      house_id: a.house ? houseIdFor(a.house) : null,
      kind: a.rule === "P01" ? "aviso" : "alerta",
      title: a.title,
      body: a.rule === "P01" ? "Aviso preventivo de calor para os próximos dias." : `Regra ${a.rule} · ${a.house ?? "granja"}`,
      link: `/alertas/${a.id}`,
      created_at: farmInstant(a.openedOn, 8, 30).toISOString(),
    }));
  if (notif.length) await insertBatched(sql, "notifications", notif);

  // decisões da reunião da semana passada e anotações nas fichas
  const prevWeek = addDays(lastCompleteWeekStart(dEnd), 0);
  await insertBatched(sql, "decisions", [
    { id: uuidFromName("decision:1"), tenant_id: TENANT_ID, week_start: prevWeek, text: "Revisar exaustores e nebulização do P005", owner_name: "Manutenção", due_date: addDays(dEnd, 5), status: "aberta", created_by: userIdFor("diretor@demo.local"), created_at: farmInstant(addDays(prevWeek, 8), 9, 40).toISOString() },
    { id: uuidFromName("decision:2"), tenant_id: TENANT_ID, week_start: prevWeek, text: "Enviar amostra da última carga do grupo A ao laboratório", owner_name: "Gerente", due_date: addDays(dEnd, 2), status: "aberta", created_by: userIdFor("diretor@demo.local"), created_at: farmInstant(addDays(prevWeek, 8), 9, 45).toISOString() },
    { id: uuidFromName("decision:3"), tenant_id: TENANT_ID, week_start: prevWeek, text: "Avaliar antecipação do descarte do L107", owner_name: "Diretoria", due_date: addDays(dEnd, 7), status: "aberta", created_by: userIdFor("diretor@demo.local"), created_at: farmInstant(addDays(prevWeek, 8), 9, 50).toISOString() },
  ]);
  await insertBatched(sql, "house_notes", [
    { id: uuidFromName("note:P005:1"), house_id: houseIdFor("P005"), user_id: userIdFor("gerente@demo.local"), text: "Placas evaporativas do lado norte com incrustação; limpeza agendada.", created_at: farmInstant(addDays(dEnd, -16), 10, 0).toISOString() },
    { id: uuidFromName("note:P005:2"), house_id: houseIdFor("P005"), user_id: userIdFor("encarregado@demo.local"), text: "Exaustor 3 fazendo barulho; avisado à manutenção.", created_at: farmInstant(addDays(dEnd, -5), 15, 20).toISOString() },
    { id: uuidFromName("note:P007:1"), house_id: houseIdFor("P007"), user_id: userIdFor("gerente@demo.local"), text: "Lote mais velho da granja; acompanhar margem semanal para decidir o descarte.", created_at: farmInstant(addDays(dEnd, -12), 11, 0).toISOString() },
    { id: uuidFromName("note:P007:2"), house_id: houseIdFor("P007"), user_id: userIdFor("encarregado@demo.local"), text: "Ovos trincados chegando na mesa de classificação pela pista 2.", created_at: farmInstant(addDays(dEnd, -3), 16, 10).toISOString() },
  ]);
  const count = (s: string) => [...states.values()].filter((x) => x.status === s).length;
  console.log(`\n    abertos=${count("aberto")} em investigação=${count("em_investigacao")} resolvidos=${count("resolvido")} descartados=${count("descartado")} perguntas=${questions} notificações=${notif.length}`);
  void weekStart;
}

/** Tabela "cenário → detectado?" (passo 12). */
export function detectionTable(w: AlertsWorld): Array<{ code: string; name: string; result: string; ok: boolean; rules: string }> {
  return w.scenarios.map((s) => {
    const inWin = w.alerts.filter((a) => (a.house == null ? false : s.houses.includes(a.house)) && a.firstDeviationOn >= addDays(s.start, -2) && a.firstDeviationOn <= addDays(s.end, 7));
    if (s.code === "S7") {
      const bad = w.alerts.filter((a) => a.house === "P002" && ["A03", "A04", "A05", "A08", "A09"].includes(a.rule) && a.firstDeviationOn >= s.start && a.firstDeviationOn <= addDays(s.start, 4));
      return { code: s.code, name: s.name, result: bad.length ? "ALERTA INDEVIDO" : "sem alerta (correto)", ok: bad.length === 0, rules: bad.map((a) => a.rule).join(",") };
    }
    const exp = inWin.filter((a) => s.expectedRules.includes(a.rule));
    return { code: s.code, name: s.name, result: exp.length ? "detectado" : "NÃO DETECTADO", ok: exp.length > 0, rules: Array.from(new Set(exp.map((a) => a.rule))).join(",") };
  });
}
