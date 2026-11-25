import "server-only";
import { getSql } from "@/db/client";
import { addDays } from "@/lib/dates";
import { aggregate } from "@/engine/metrics/compute";
import { METRIC_BY_CODE, isFinanceMetric } from "@/engine/metrics/catalog";
import { PermissionError, type Scope } from "@/server/permissions";
import { getHouses } from "@/server/repositories/reference";

export interface Cell {
  value: number | null;
  num: number | null;
  den: number | null;
}

export interface DailyRow extends Cell {
  house: string;
  date: string;
  metric: string;
  ageWeek: number;
  ageDays: number;
  flockId: string;
  qf: number;
}

const d10 = (v: unknown) => (typeof v === "string" ? v.slice(0, 10) : (v as Date).toISOString().slice(0, 10));
const n = (v: unknown) => (v == null ? null : Number(v));

/** Remove métricas financeiras para quem não pode vê-las (permissão aplicada no servidor). */
export function guardMetrics(scope: Scope, metrics: string[]): string[] {
  const blocked = metrics.filter(isFinanceMetric);
  if (blocked.length && !scope.canSeeFinance) {
    if (blocked.length === metrics.length) throw new PermissionError("O perfil encarregado não tem acesso aos dados financeiros.");
    return metrics.filter((m) => !isFinanceMetric(m));
  }
  return metrics;
}

export async function scopedHouseCodes(scope: Scope, requested?: string[] | null): Promise<string[]> {
  const houses = await getHouses();
  const all = houses.map((h) => h.code).filter((c) => scope.houseCodes.has(c));
  if (!requested || requested.length === 0) return all;
  return requested.filter((c) => scope.houseCodes.has(c));
}

/** Lê daily_metrics de galpões e métricas no período. */
export async function readDaily(scope: Scope, opts: { houses?: string[] | null; metrics: string[]; from: string; to: string }): Promise<DailyRow[]> {
  const metrics = guardMetrics(scope, opts.metrics);
  const codes = await scopedHouseCodes(scope, opts.houses);
  if (!codes.length || !metrics.length) return [];
  const sql = getSql();
  const rows = await sql`
    select h.code as house, m.date, m.metric_code, m.value, m.numerator, m.denominator, m.age_week, m.age_days, m.flock_id, m.quality_flag
    from app.daily_metrics m join app.houses h on h.id = m.house_id
    where h.code in ${sql(codes)} and m.metric_code in ${sql(metrics)} and m.date between ${opts.from} and ${opts.to}
    order by m.date`;
  return rows.map((r) => ({
    house: r.house,
    date: d10(r.date),
    metric: r.metric_code,
    value: n(r.value),
    num: n(r.numerator),
    den: n(r.denominator),
    ageWeek: Number(r.age_week),
    ageDays: Number(r.age_days),
    flockId: r.flock_id,
    qf: Number(r.quality_flag),
  }));
}

export interface WeeklyRowQ extends Cell {
  house: string;
  weekStart: string;
  metric: string;
  ageWeek: number;
  phase: string;
  daysCount: number;
  flockId: string;
}

export async function readWeekly(scope: Scope, opts: { houses?: string[] | null; metrics: string[]; from: string; to: string }): Promise<WeeklyRowQ[]> {
  const metrics = guardMetrics(scope, opts.metrics);
  const codes = await scopedHouseCodes(scope, opts.houses);
  if (!codes.length || !metrics.length) return [];
  const sql = getSql();
  const rows = await sql`
    select h.code as house, m.week_start, m.metric_code, m.value, m.numerator, m.denominator, m.age_week, m.phase, m.days_count, m.flock_id
    from app.weekly_metrics m join app.houses h on h.id = m.house_id
    where h.code in ${sql(codes)} and m.metric_code in ${sql(metrics)} and m.week_start between ${opts.from} and ${opts.to}
    order by m.week_start`;
  return rows.map((r) => ({
    house: r.house,
    weekStart: d10(r.week_start),
    metric: r.metric_code,
    value: n(r.value),
    num: n(r.numerator),
    den: n(r.denominator),
    ageWeek: Number(r.age_week),
    phase: r.phase,
    daysCount: Number(r.days_count),
    flockId: r.flock_id,
  }));
}

/**
 * Agrega células de vários dias/galpões de uma métrica pela regra do catálogo (soma ÷ soma; nunca média de percentuais).
 * `mode`: "periodo" para janelas de vários dias de um galpão; "granja" para somar galpões num mesmo dia.
 */
export function aggregateCells(metric: string, cells: Cell[], mode: "periodo" | "granja" = "periodo"): Cell {
  const def = METRIC_BY_CODE[metric];
  if (!def) return { value: null, num: null, den: null };
  if (metric === "mort.diaria" && mode === "periodo") {
    // mortalidade do período = Σ mortes ÷ aves no início do período
    const first = cells.find((c) => c.den != null);
    const deaths = cells.reduce((a, c) => a + (c.num ?? 0), 0);
    return first?.den ? { value: (deaths / first.den) * 100, num: deaths, den: first.den } : { value: null, num: null, den: null };
  }
  let kind = def.aggregation;
  if (mode === "granja" && kind === "ultimo") kind = "razao";
  const r = aggregate(metric, kind, cells);
  if (mode === "granja" && def.aggregation === "ultimo" && r.num != null && r.den) {
    const scale = ["mort.acumulada", "mort.viabilidade"].includes(metric) ? 100 : 1;
    return { ...r, value: (r.num / r.den) * scale };
  }
  return r;
}

/** Série diária agregada (granja ou subconjunto de galpões) para uma métrica. */
export function farmSeries(rows: DailyRow[], metric: string, from: string, to: string): Array<{ date: string; value: number | null }> {
  const byDate = new Map<string, Cell[]>();
  for (const r of rows) {
    if (r.metric !== metric) continue;
    let a = byDate.get(r.date);
    if (!a) byDate.set(r.date, (a = []));
    a.push(r);
  }
  const out: Array<{ date: string; value: number | null }> = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const cells = byDate.get(d);
    out.push({ date: d, value: cells ? aggregateCells(metric, cells, "granja").value : null });
  }
  return out;
}

/** Agrega uma janela de dias: primeiro por galpão (período), depois soma galpões (granja) pelos num/den. */
export function windowAggregate(rows: DailyRow[], metric: string, from: string, to: string, houses?: string[]): { byHouse: Map<string, Cell>; total: Cell } {
  const byHouse = new Map<string, Cell[]>();
  for (const r of rows) {
    if (r.metric !== metric || r.date < from || r.date > to) continue;
    if (houses && !houses.includes(r.house)) continue;
    let a = byHouse.get(r.house);
    if (!a) byHouse.set(r.house, (a = []));
    a.push(r);
  }
  const agg = new Map<string, Cell>();
  for (const [h, cells] of byHouse) agg.set(h, aggregateCells(metric, cells, "periodo"));
  const def = METRIC_BY_CODE[metric];
  let total: Cell;
  if (def?.aggregation === "max" || def?.aggregation === "min") {
    const vals = [...agg.values()].map((c) => c.value).filter((v): v is number => v != null);
    total = { value: vals.length ? (def.aggregation === "max" ? Math.max(...vals) : Math.min(...vals)) : null, num: null, den: null };
  } else total = aggregateCells(metric, [...agg.values()], "granja");
  return { byHouse: agg, total };
}
