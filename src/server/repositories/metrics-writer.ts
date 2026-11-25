/** Converte os resultados do motor de indicadores em linhas das tabelas calculadas. */
import { TENANT_ID, flockIdFor, houseIdFor, strainIdFor } from "@/lib/ids";
import type { AggRow } from "@/engine/metrics/compute";
import type { MetricStore } from "@/engine/metrics/store";
import type { InternalStandardRow } from "@/engine/standards/internal";
import type { Row } from "./dataset-writer";

const r6 = (v: number | null) => (v == null ? null : Math.round(v * 1e6) / 1e6);

export function dailyMetricRows(store: MetricStore, computedAt: string): Row[] {
  const out: Row[] = [];
  for (const c of store.cells()) {
    const meta = store.meta.get(c.house)!;
    out.push({
      tenant_id: TENANT_ID,
      house_id: houseIdFor(c.house),
      flock_id: flockIdFor(meta.flock[c.i]!),
      date: store.dateAt(c.i),
      age_days: meta.ageDays[c.i],
      age_week: meta.ageWeek[c.i],
      phase: meta.phase[c.i] ?? "inicio",
      metric_code: c.metric,
      value: r6(c.value),
      numerator: r6(c.num),
      denominator: r6(c.den),
      quality_flag: c.qf,
      computed_at: computedAt,
    });
  }
  return out;
}

export function weeklyMetricRows(rows: AggRow[], computedAt: string): Row[] {
  return rows
    .filter((r) => r.house && r.flock)
    .map((r) => ({
      tenant_id: TENANT_ID,
      house_id: houseIdFor(r.house!),
      flock_id: flockIdFor(r.flock!),
      week_start: r.key,
      age_week: r.ageWeek ?? 0,
      phase: r.phase || "inicio",
      metric_code: r.metric,
      value: r6(r.value),
      numerator: r6(r.num),
      denominator: r6(r.den),
      days_count: r.daysCount ?? 7,
      computed_at: computedAt,
    }));
}

export function farmDailyRows(rows: AggRow[], computedAt: string): Row[] {
  return rows.map((r) => ({
    tenant_id: TENANT_ID,
    date: r.key,
    metric_code: r.metric,
    value: r6(r.value),
    numerator: r6(r.num),
    denominator: r6(r.den),
    quality_flag: r.value == null ? 2 : 0,
    computed_at: computedAt,
  }));
}

export function farmWeeklyRows(rows: AggRow[], computedAt: string): Row[] {
  return rows.map((r) => ({
    tenant_id: TENANT_ID,
    week_start: r.key,
    metric_code: r.metric,
    value: r6(r.value),
    numerator: r6(r.num),
    denominator: r6(r.den),
    days_count: r.daysCount ?? 7,
    computed_at: computedAt,
  }));
}

export function internalStandardRows(rows: InternalStandardRow[]): Row[] {
  return rows.map((r) => ({
    strain_id: strainIdFor(r.strainCode),
    age_week: r.ageWeek,
    metric_code: r.metric,
    n_flocks: r.nFlocks,
    mean: r6(r.mean),
    median: r6(r.median),
    p25: r6(r.p25),
    p75: r6(r.p75),
    excluded_weeks: r.excludedWeeks,
  }));
}
