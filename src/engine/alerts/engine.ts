/**
 * Motor de alertas (Parte 10): avaliação diária, ciclo de vida e backtest.
 * Um alerta aberto por (regra, galpão). Persistência conta dias seguidos com a condição verdadeira.
 */
import { addDays, diffDays, weekStart } from "@/lib/dates";
import { uuidFromName } from "@/lib/ids";
import { RULE_BY_CODE } from "./rules";
import { computeCusum, evalCondition, evalNormal, isSunday, type CondResult, type RuleContext } from "./conditions";

export const DAILY_RULES = ["A03", "A05", "A06", "A08", "A09", "A11", "A14", "A15", "A16", "A17"] as const;

export interface EngineAlert {
  id: string;
  rule: string;
  house: string | null;
  flock: string | null;
  metric: string | null;
  anomalyType: string;
  firstDeviationOn: string;
  openedOn: string;
  lastSeenOn: string;
  conditionClearedOn: string | null;
  /** fechamento automático do backtest (emula o tratamento histórico pela equipe) */
  closedOn: string | null;
  severity: string;
  title: string;
  observed: Record<string, unknown>;
  evidence: Record<string, unknown>;
  reopenedCount: number;
  source: "backtest" | "diario" | "ao_vivo";
  /** referência congelada na abertura (para a condição normalizada) */
  frozenRef: number | null;
}

export interface EngineState {
  open: Map<string, EngineAlert>;
  closed: EngineAlert[];
  hitStreak: Map<string, { n: number; first: string }>;
  normalStreak: Map<string, number>;
  silencedUntil: Map<string, string>;
}

export function newState(): EngineState {
  return { open: new Map(), closed: [], hitStreak: new Map(), normalStreak: new Map(), silencedUntil: new Map() };
}

const nf = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? "—" : new Intl.NumberFormat("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v));

/** Título em linguagem de granja (Parte 14.15). */
export function alertTitle(rule: string, house: string | null, c: CondResult, extra: Record<string, unknown> = {}): string {
  const h = house ?? "granja";
  const x = c.extra ?? {};
  switch (rule) {
    case "A03":
      return `Postura do ${h} caiu ${nf(Number(x.drop))} p.p. em 2 dias`;
    case "A04":
      return `Postura semanal do ${h} ${nf(Number(extra.gap))} p.p. abaixo do ${extra.ref === "interno" ? "padrão interno" : "padrão da linhagem"}`;
    case "A05":
      return `Queda lenta de postura no ${h}`;
    case "A06":
      return `Mortalidade do ${h} em ${nf(c.value, 2)}% (${nf(Number(x.ratio), 1)} × a mediana)`;
    case "A08":
      return `Consumo de água do ${h} caiu ${nf(Math.abs(Number(x.pct)), 0)}%`;
    case "A09":
      return `Consumo de ração do ${h} caiu ${nf(Math.abs(Number(x.pct)), 0)}%`;
    case "A11":
      return `Temperatura interna do ${h} chegou a ${nf(c.value)} °C (${nf(Number(x.hours32), 0)} h acima de 32 °C)`;
    case "A14":
      return `Trincados do ${h} em ${nf(c.value, 2)}% (${nf(Number(x.ratio), 1)} × a mediana)`;
    case "A15":
      return `Avarias na pista ${x.lane ?? "?"} do ${h} ${nf(c.value, 1)} × a outra pista`;
    case "A16":
      return `Sujos de fezes do ${h} em ${nf(c.value, 2)}% (${nf(Number(x.ratio), 1)} × a mediana)`;
    case "A17":
      return `Sujos de sangue do ${h} em ${nf(c.value, 2)}% (${nf(Number(x.ratio), 1)} × a mediana)`;
    case "A22":
      return `Margem negativa do ${h} há ${extra.weeks ?? 3} semanas`;
    case "P01":
      return `Previsão de calor: ${nf(Number(extra.max))} °C em ${String(extra.date ?? "").slice(8, 10)}/${String(extra.date ?? "").slice(5, 7)}`;
    default:
      return `${RULE_BY_CODE[rule]?.name ?? rule} no ${h}`;
  }
}

function severityOf(rule: string, c: CondResult): string {
  const def = RULE_BY_CODE[rule];
  if ((rule === "A06" || rule === "A11") && c.critical) return "critica";
  return def?.severity ?? "media";
}

function makeAlert(rule: string, house: string | null, flock: string | null, first: string, d: string, c: CondResult, source: EngineAlert["source"], extra: Record<string, unknown> = {}): EngineAlert {
  const def = RULE_BY_CODE[rule];
  return {
    id: uuidFromName(`alert:${rule}:${house ?? "farm"}:${first}:${source}`),
    rule,
    house,
    flock,
    metric: def?.metric ?? null,
    anomalyType: def?.anomalyType ?? "outro",
    firstDeviationOn: first,
    openedOn: d,
    lastSeenOn: d,
    conditionClearedOn: null,
    closedOn: null,
    severity: severityOf(rule, c),
    title: alertTitle(rule, house, c, extra),
    observed: { date: d, value: c.value, reference: c.reference, deviation: c.value != null && c.reference != null ? c.value - c.reference : null, unit: def?.metric ?? null, ...c.extra, ...extra },
    evidence: {},
    reopenedCount: 0,
    source,
    frozenRef: c.reference,
  };
}

export interface RunOptions {
  autoClose: boolean;
  source: EngineAlert["source"];
  /** último dia: avalia a regra preventiva P01 */
  forecastDay?: string;
}

function closeAlert(state: EngineState, key: string, a: EngineAlert, d: string) {
  a.closedOn = d;
  state.open.delete(key);
  state.closed.push(a);
}

/** Avalia todas as regras num dia, atualizando o estado. */
export function runDay(ctx: RuleContext, d: string, state: EngineState, opts: RunOptions): EngineAlert[] {
  const opened: EngineAlert[] = [];
  for (const house of ctx.store.houses) {
    const flock = ctx.store.flockAt(house, d);
    // lote saiu do galpão: encerra os alertas abertos daquele galpão
    for (const [key, a] of state.open) {
      if (a.house === house && a.flock !== flock && opts.autoClose) closeAlert(state, key, a, addDays(d, -1));
    }
    if (!flock) continue;
    for (const rule of DAILY_RULES) {
      const key = `${rule}|${house}`;
      const sil = state.silencedUntil.get(key);
      if (sil && d <= sil) continue;
      const def = RULE_BY_CODE[rule];
      const p = ctx.params[rule] ?? def.params;
      const c = evalCondition(ctx, rule, house, d);
      const open = state.open.get(key);
      if (open) {
        if (c.hit) {
          open.lastSeenOn = d;
          if (c.critical && open.severity !== "critica") open.severity = "critica";
          state.normalStreak.set(key, 0);
        } else {
          const norm = evalNormal(ctx, rule, house, d, open.frozenRef);
          const n = norm ? (state.normalStreak.get(key) ?? 0) + 1 : norm === false ? 0 : (state.normalStreak.get(key) ?? 0);
          state.normalStreak.set(key, n);
          if (n >= (p.normal_days ?? 2) && !open.conditionClearedOn) {
            open.conditionClearedOn = d;
            open.evidence.condition_cleared_on = d;
            if (opts.autoClose) closeAlert(state, key, open, d);
          }
        }
        continue;
      }
      // sem alerta aberto: conta dias seguidos com a condição
      const st = state.hitStreak.get(key);
      if (c.hit) {
        const first = rule === "A05" && typeof c.extra?.runStart === "string" ? (c.extra.runStart as string) : (st?.first ?? d);
        const n = (st?.n ?? 0) + 1;
        state.hitStreak.set(key, { n, first });
        if (n >= (p.persistence ?? 1)) {
          state.hitStreak.delete(key);
          state.normalStreak.set(key, 0);
          // reabre se a condição voltou em até 48 h depois de um alerta fechado
          const last = [...state.closed].reverse().find((x) => x.rule === rule && x.house === house);
          if (!opts.autoClose && last && last.closedOn && diffDays(last.closedOn, d) <= 2 && last.flock === flock) {
            state.closed.splice(state.closed.indexOf(last), 1);
            last.closedOn = null;
            last.conditionClearedOn = null;
            delete last.evidence.condition_cleared_on;
            last.lastSeenOn = d;
            last.reopenedCount += 1;
            state.open.set(key, last);
          } else {
            const a = makeAlert(rule, house, flock, first, d, c, opts.source);
            state.open.set(key, a);
            opened.push(a);
          }
        }
      } else if (st) state.hitStreak.delete(key);
    }
    // regras semanais aos domingos (semana completa anterior)
    if (isSunday(d)) {
      const ws = addDays(d, -7);
      opened.push(...weeklyRules(ctx, house, flock, ws, d, state, opts));
    }
  }
  if (opts.forecastDay && d === opts.forecastDay) {
    const p01 = preventiveHeat(ctx, d, state, opts);
    if (p01) opened.push(p01);
  }
  return opened;
}

function weeklyRules(ctx: RuleContext, house: string, flock: string, ws: string, d: string, state: EngineState, opts: RunOptions): EngineAlert[] {
  const out: EngineAlert[] = [];
  // A04 — postura semanal abaixo do padrão
  {
    const key = `A04|${house}`;
    const p = ctx.params.A04 ?? RULE_BY_CODE.A04.params;
    const wp = ctx.weeklyPosture?.(house, ws);
    const f = ctx.flocks.get(flock);
    const sil = state.silencedUntil.get(key);
    if (wp && wp.value != null && wp.ageWeek != null && wp.days >= 7 && f && wp.ageWeek >= p.min_age_weeks && !(sil && d <= sil)) {
      const internal = ctx.internal.sufficient(f.strainCode, "prod.postura", wp.ageWeek) ? ctx.internal.medianAt(f.strainCode, "prod.postura", wp.ageWeek) : null;
      const ref = internal != null ? internal - p.internal_pp : (ctx.strainStd.week(f.strainCode, "prod.postura", wp.ageWeek) ?? 0) - p.strain_pp;
      const hit = wp.value < ref;
      const open = state.open.get(key);
      if (open) {
        if (hit) open.lastSeenOn = d;
        else {
          open.conditionClearedOn = d;
          open.evidence.condition_cleared_on = d;
          if (opts.autoClose) closeAlert(state, key, open, d);
        }
      } else if (hit) {
        const base = internal != null ? internal : (ctx.strainStd.week(f.strainCode, "prod.postura", wp.ageWeek) ?? 0);
        const c: CondResult = { hit, value: wp.value, reference: ref };
        const a = makeAlert("A04", house, flock, ws, d, c, opts.source, { gap: base - wp.value, ref: internal != null ? "interno" : "linhagem", week: ws });
        state.open.set(key, a);
        out.push(a);
      }
    }
  }
  // A22 — margem semanal negativa por 3 semanas seguidas
  if (ctx.weeklyMargin) {
    const key = `A22|${house}`;
    const p = ctx.params.A22 ?? RULE_BY_CODE.A22.params;
    const weeks = Array.from({ length: p.weeks }, (_, i) => addDays(ws, -7 * i));
    const margins = weeks.map((w) => ctx.weeklyMargin!(house, w));
    const open = state.open.get(key);
    const cur = margins[0];
    if (open) {
      if (cur != null && cur >= 0) {
        open.conditionClearedOn = d;
        open.evidence.condition_cleared_on = d;
        if (opts.autoClose) closeAlert(state, key, open, d);
      } else open.lastSeenOn = d;
    } else if (margins.every((m) => m != null && m < 0)) {
      const c: CondResult = { hit: true, value: cur, reference: 0 };
      const a = makeAlert("A22", house, flock, weeks[weeks.length - 1], d, c, opts.source, { weeks: p.weeks, margins: margins.reverse() });
      state.open.set(key, a);
      out.push(a);
    }
  }
  return out;
}

/** P01 — previsão de máxima externa ≥ 36 °C nos próximos 3 dias: aviso preventivo da granja. */
export function preventiveHeat(ctx: RuleContext, d: string, state: EngineState, opts: RunOptions): EngineAlert | null {
  const p = ctx.params.P01 ?? RULE_BY_CODE.P01.params;
  const days = (ctx.forecast ?? []).filter((f) => f.date > d && f.date <= addDays(d, p.days_ahead) && f.tempMax >= p.temp);
  if (!days.length) return null;
  const key = `P01|farm`;
  if (state.open.has(key)) return null;
  const max = days.reduce((a, b) => (b.tempMax > a.tempMax ? b : a));
  const houses = Object.entries(ctx.coolingDelta ?? {})
    .sort((a, b) => a[1] - b[1])
    .slice(0, 3)
    .map(([code, coolingDelta]) => ({ code, coolingDelta }));
  const c: CondResult = { hit: true, value: max.tempMax, reference: p.temp };
  const a = makeAlert("P01", null, null, d, d, c, opts.source, { max: max.tempMax, date: max.date, days: days.map((x) => ({ date: x.date, tempMax: x.tempMax })), houses });
  a.severity = "aviso";
  state.open.set(key, a);
  return a;
}

export interface BacktestResult {
  alerts: EngineAlert[];
  state: EngineState;
}

/** Backtest (Parte 10.6): avalia dia a dia de D_start + 30 até D_end, sem olhar o futuro. */
export function backtest(ctx: RuleContext, from: string, to: string, opts: { forecastDay?: string } = {}): BacktestResult {
  // CUSUM sequencial por galpão
  ctx.cusum = new Map(ctx.store.houses.map((h) => [h, computeCusum(ctx, h, from, to)]));
  const state = newState();
  const all: EngineAlert[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    all.push(...runDay(ctx, d, state, { autoClose: true, source: "backtest", forecastDay: opts.forecastDay }));
  }
  // alertas reabertos já estão na lista; ordena por abertura
  const unique = new Map(all.map((a) => [a.id, a]));
  return { alerts: [...unique.values()].sort((a, b) => (a.openedOn < b.openedOn ? -1 : a.openedOn > b.openedOn ? 1 : 0)), state };
}

export { weekStart };
