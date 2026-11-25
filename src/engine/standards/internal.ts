/**
 * Padrão interno (Parte 8.3): desempenho semanal dos lotes encerrados da própria granja, por linhagem e semana de idade.
 * Exclui semanas dentro da janela de efeito de eventos sanitários confirmados e de ondas de calor.
 */
import { addDays, diffDays } from "@/lib/dates";
import { mean, median, quantile } from "@/engine/stats";
import { EVENT_TYPE_BY_CODE, effectDaysFor } from "@/engine/impacts/event-types";
import { INTERNAL_STANDARD_METRICS } from "@/engine/metrics/catalog";
import type { EventRecord, Flock } from "@/engine/types";
import type { AggRow } from "@/engine/metrics/compute";

export interface InternalStandardRow {
  strainCode: string;
  ageWeek: number;
  metric: string;
  nFlocks: number;
  mean: number | null;
  median: number | null;
  p25: number | null;
  p75: number | null;
  excludedWeeks: number;
}

export const MIN_INTERNAL_FLOCKS = 3;

export class InternalStandards {
  private map = new Map<string, InternalStandardRow>();
  constructor(readonly rows: InternalStandardRow[]) {
    for (const r of rows) this.map.set(`${r.strainCode}|${r.metric}|${r.ageWeek}`, r);
  }
  get(strain: string, metric: string, ageWeek: number): InternalStandardRow | undefined {
    return this.map.get(`${strain}|${metric}|${ageWeek}`);
  }
  /** Mediana do padrão interno, só quando há pelo menos 3 lotes; senão nulo (usar a curva da linhagem). */
  medianAt(strain: string, metric: string, ageWeek: number): number | null {
    const r = this.get(strain, metric, ageWeek);
    return r && r.nFlocks >= MIN_INTERNAL_FLOCKS ? r.median : null;
  }
  sufficient(strain: string, metric: string, ageWeek: number): boolean {
    const r = this.get(strain, metric, ageWeek);
    return !!r && r.nFlocks >= MIN_INTERNAL_FLOCKS;
  }
}

/** Janelas de exclusão por galpão: [início, fim] do efeito de eventos sanitários confirmados e ondas de calor. */
export function exclusionWindows(events: EventRecord[]): Map<string, Array<[string, string]>> {
  const out = new Map<string, Array<[string, string]>>();
  for (const e of events) {
    const def = EVENT_TYPE_BY_CODE[e.typeCode];
    if (!def) continue;
    const isSanit = def.category === "sanitario" && e.certainty === "confirmado";
    const isHeat = e.typeCode === "ambiente.onda_calor";
    if (!isSanit && !isHeat) continue;
    const dur = e.endDate ? diffDays(e.startDate, e.endDate) + 1 : 1;
    const eff = Math.max(1, effectDaysFor(def, dur));
    const win: [string, string] = [e.startDate, addDays(e.startDate, eff - 1)];
    for (const h of e.houses) {
      let a = out.get(h);
      if (!a) out.set(h, (a = []));
      a.push(win);
    }
  }
  return out;
}

export function computeInternalStandards(weekly: AggRow[], flocks: Flock[], events: EventRecord[]): InternalStandardRow[] {
  const closed = new Map(flocks.filter((f) => f.status === "encerrado").map((f) => [f.code, f]));
  const excl = exclusionWindows(events);
  const metrics = new Set<string>(INTERNAL_STANDARD_METRICS);
  // valores por (linhagem, métrica, semana) → lista por lote
  const buckets = new Map<string, Map<string, number>>();
  const excluded = new Map<string, number>();
  for (const r of weekly) {
    if (!r.house || !r.flock || !metrics.has(r.metric) || r.value == null) continue;
    const f = closed.get(r.flock);
    if (!f || (r.daysCount ?? 0) < 7 || r.ageWeek == null) continue;
    const k = `${f.strainCode}|${r.metric}|${r.ageWeek}`;
    const we = addDays(r.key, 6);
    const wins = excl.get(r.house) ?? [];
    if (wins.some(([a, b]) => a <= we && b >= r.key)) {
      excluded.set(k, (excluded.get(k) ?? 0) + 1);
      continue;
    }
    let m = buckets.get(k);
    if (!m) buckets.set(k, (m = new Map()));
    m.set(f.code, r.value);
  }
  const keys = new Set([...buckets.keys(), ...excluded.keys()]);
  const out: InternalStandardRow[] = [];
  for (const k of keys) {
    const [strainCode, metric, wk] = k.split("|");
    const vals = [...(buckets.get(k)?.values() ?? [])];
    out.push({
      strainCode,
      metric,
      ageWeek: Number(wk),
      nFlocks: vals.length,
      mean: mean(vals),
      median: median(vals),
      p25: quantile(vals, 0.25),
      p75: quantile(vals, 0.75),
      excludedWeeks: excluded.get(k) ?? 0,
    });
  }
  return out.sort((a, b) => (a.strainCode + a.metric).localeCompare(b.strainCode + b.metric) || a.ageWeek - b.ageWeek);
}
