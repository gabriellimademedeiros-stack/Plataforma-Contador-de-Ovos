/**
 * Condições das regras de alerta (Parte 10.1). Funções puras sobre o MetricStore, usando só dados até o dia avaliado.
 * Dias com quality_flag ≠ 0 não entram nem na base nem na avaliação.
 */
import { addDays, dayOfWeek } from "@/lib/dates";
import { mean, median, stdev } from "@/engine/stats";
import type { MetricStore } from "@/engine/metrics/store";
import { expectedPosture, type ExpectedContext } from "@/engine/standards/expected";
import type { InternalStandards } from "@/engine/standards/internal";
import type { StrainStandards } from "@/engine/standards/strain";
import type { Flock } from "@/engine/types";

export interface CondResult {
  /** true = condição de abertura verdadeira; false = falsa; null = não avalia (sem base) */
  hit: boolean | null;
  value: number | null;
  reference: number | null;
  /** valores auxiliares para o título e a evidência */
  extra?: Record<string, number | string | null>;
  critical?: boolean;
}

export interface RuleContext {
  store: MetricStore;
  flocks: Map<string, Flock>;
  strainStd: StrainStandards;
  internal: InternalStandards;
  expected: ExpectedContext;
  params: Record<string, Record<string, number>>;
  /** CUSUM por galpão (A05): S(d) calculado em sequência */
  cusum?: Map<string, Map<string, { S: number; runStart: string | null; r: number | null }>>;
  /** Margem semanal por galpão (A22) */
  weeklyMargin?: (house: string, weekStart: string) => number | null;
  /** Postura semanal por galpão (A04) */
  weeklyPosture?: (house: string, weekStart: string) => { value: number | null; ageWeek: number | null; days: number };
  forecast?: Array<{ date: string; tempMax: number }>;
  coolingDelta?: Record<string, number>;
}

const P = (ctx: RuleContext, rule: string) => ctx.params[rule] ?? {};

function validWindow(store: MetricStore, house: string, metric: string, d: string, from: number, to: number): number[] {
  const out: number[] = [];
  for (let k = from; k <= to; k++) {
    const v = store.getValid(house, metric, addDays(d, -k));
    if (v != null) out.push(v);
  }
  return out;
}

/** Média dos dias d−7…d−1 (válidos) ou null se < mínimo. */
export function baseMean(store: MetricStore, house: string, metric: string, d: string, days = 7, minValid = 5): number | null {
  const xs = validWindow(store, house, metric, d, 1, days);
  return xs.length >= minValid ? mean(xs) : null;
}

/** Mediana de d−14…d−1 (válidos) ou null. */
export function median14(store: MetricStore, house: string, metric: string, d: string, days = 14, minValid = 5): number | null {
  const xs = validWindow(store, house, metric, d, 1, days);
  return xs.length >= minValid ? median(xs) : null;
}

export function ageWeekOf(ctx: RuleContext, house: string, d: string): number | null {
  return ctx.store.ageWeekAt(house, d);
}

/** Avalia a condição de abertura de uma regra diária num galpão e dia. */
export function evalCondition(ctx: RuleContext, rule: string, house: string, d: string): CondResult {
  const s = ctx.store;
  const p = P(ctx, rule);
  const minAge = p.min_age_weeks ?? 0;
  const age = ageWeekOf(ctx, house, d);
  if (age == null) return { hit: null, value: null, reference: null };
  if (age < minAge) return { hit: null, value: null, reference: null };
  switch (rule) {
    case "A03": {
      const x = s.getValid(house, "prod.postura", d);
      const b = baseMean(s, house, "prod.postura", d, p.base_days, p.min_valid);
      if (x == null || b == null) return { hit: null, value: x, reference: b };
      return { hit: x <= b - p.drop_pp, value: x, reference: b, extra: { drop: b - x } };
    }
    case "A06": {
      const x = s.getValid(house, "mort.diaria", d);
      const m = median14(s, house, "mort.diaria", d, p.median_days, p.min_valid);
      if (x == null || m == null) return { hit: null, value: x, reference: m };
      return { hit: x > p.factor * m && x > p.min_pct, value: x, reference: m, critical: x > p.critical_pct, extra: { ratio: m > 0 ? x / m : null, deaths: s.get(house, "mort.mortes", d) } };
    }
    case "A08":
    case "A09": {
      const metric = rule === "A08" ? "nut.agua" : "nut.racao";
      const x = s.getValid(house, metric, d);
      const b = baseMean(s, house, metric, d, p.base_days, p.min_valid);
      if (x == null || b == null) return { hit: null, value: x, reference: b };
      return { hit: x <= p.ratio * b, value: x, reference: b, extra: { pct: (x / b - 1) * 100 } };
    }
    case "A11": {
      const h32 = s.get(house, "amb.horas_32", d);
      const tmax = s.get(house, "amb.temp_max", d);
      if (h32 == null || tmax == null) return { hit: null, value: tmax, reference: null };
      const crit = tmax > p.critical_temp;
      return { hit: h32 >= p.min_hours || crit, value: tmax, reference: p.hours_threshold, critical: crit, extra: { hours32: h32 } };
    }
    case "A14":
    case "A16":
    case "A17": {
      const metric = rule === "A14" ? "qual.trincados" : rule === "A16" ? "qual.sujos_fezes" : "qual.sujos_sangue";
      const x = s.getValid(house, metric, d);
      const m = median14(s, house, metric, d, p.median_days, p.min_valid);
      if (x == null || m == null) return { hit: null, value: x, reference: m };
      return { hit: x >= p.factor * m && x - m >= p.min_add_pp, value: x, reference: m, extra: { ratio: m > 0 ? x / m : null } };
    }
    case "A15": {
      const r = s.getValid(house, "qual.razao_pistas", d);
      const e1 = s.get(house, "prod.ovos_pista1", d);
      const e2 = s.get(house, "prod.ovos_pista2", d);
      const a1 = s.get(house, "qual.avarias_pista1", d);
      const a2 = s.get(house, "qual.avarias_pista2", d);
      if (r == null || e1 == null || e2 == null) return { hit: null, value: r, reference: null };
      const enough = e1 >= p.min_eggs_lane && e2 >= p.min_eggs_lane;
      return { hit: enough && r >= p.ratio, value: r, reference: p.ratio, extra: { lane: a1 != null && a2 != null ? (a2 > a1 ? 2 : 1) : null, p1: a1, p2: a2 } };
    }
    case "A05": {
      const c = ctx.cusum?.get(house)?.get(d);
      if (!c) return { hit: null, value: null, reference: null };
      return { hit: c.S > p.h, value: c.S, reference: p.h, extra: { runStart: c.runStart } };
    }
    default:
      return { hit: null, value: null, reference: null };
  }
}

/** Condição normalizada da regra (com a referência congelada na abertura). */
export function evalNormal(ctx: RuleContext, rule: string, house: string, d: string, frozenRef: number | null): boolean | null {
  const s = ctx.store;
  const p = P(ctx, rule);
  switch (rule) {
    case "A03": {
      const x = s.getValid(house, "prod.postura", d);
      return x == null || frozenRef == null ? null : x >= frozenRef - p.normal_pp;
    }
    case "A06": {
      const x = s.getValid(house, "mort.diaria", d);
      const m = median14(s, house, "mort.diaria", d, p.median_days, p.min_valid) ?? frozenRef;
      return x == null || m == null ? null : x < p.normal_factor * m;
    }
    case "A08":
    case "A09": {
      const x = s.getValid(house, rule === "A08" ? "nut.agua" : "nut.racao", d);
      return x == null || frozenRef == null ? null : x >= p.normal_ratio * frozenRef;
    }
    case "A11": {
      const h = s.get(house, "amb.horas_32", d);
      return h == null ? null : h === 0;
    }
    case "A14":
    case "A16":
    case "A17": {
      const x = s.getValid(house, rule === "A14" ? "qual.trincados" : rule === "A16" ? "qual.sujos_fezes" : "qual.sujos_sangue", d);
      return x == null || frozenRef == null ? null : x < p.normal_factor * frozenRef;
    }
    case "A15": {
      const r = s.getValid(house, "qual.razao_pistas", d);
      return r == null ? null : r < p.normal_ratio;
    }
    case "A05": {
      const c = ctx.cusum?.get(house)?.get(d);
      return c ? c.S === 0 : null;
    }
    default:
      return null;
  }
}

/**
 * CUSUM de quedas de postura por galpão (A05): r(d) = (postura − esperado com calor) / dp dos resíduos dos últimos 56 dias (mín. 0,5);
 * S(d) = max(0, S(d−1) − r(d) − k). Só para lotes com idade mínima.
 */
export function computeCusum(ctx: RuleContext, house: string, from: string, to: string): Map<string, { S: number; runStart: string | null; r: number | null }> {
  const p = P(ctx, "A05");
  const out = new Map<string, { S: number; runStart: string | null; r: number | null }>();
  const resid = new Map<string, number>();
  let S = 0;
  let runStart: string | null = null;
  let prevFlock: string | null = null;
  const start = addDays(from, -(p.resid_days ?? 56));
  for (let d = start; d <= to; d = addDays(d, 1)) {
    const flock = ctx.store.flockAt(house, d);
    if (flock !== prevFlock) {
      S = 0;
      runStart = null;
      resid.clear();
      prevFlock = flock;
    }
    const x = ctx.store.getValid(house, "prod.postura", d);
    const age = ctx.store.ageWeekAt(house, d);
    if (x == null || age == null) {
      if (d >= from) out.set(d, { S, runStart, r: null });
      continue;
    }
    const exp = expectedPosture(ctx.expected, house, d);
    if (!exp) continue;
    const res = x - exp.withHeat;
    const window: number[] = [];
    for (let k = 1; k <= (p.resid_days ?? 56); k++) {
      const v = resid.get(addDays(d, -k));
      if (v != null) window.push(v);
    }
    resid.set(d, res);
    const sd = Math.max(p.min_sd ?? 0.5, stdev(window) ?? 0);
    const r = res / sd;
    if (age < (p.min_age_weeks ?? 26) || window.length < 14) {
      S = 0;
      runStart = null;
    } else {
      const next = Math.max(0, S - r - (p.k ?? 0.5));
      if (S === 0 && next > 0) runStart = d;
      if (next === 0) runStart = null;
      S = next;
    }
    if (d >= from) out.set(d, { S, runStart, r });
  }
  return out;
}

export function isSunday(d: string) {
  return dayOfWeek(d) === 0;
}
