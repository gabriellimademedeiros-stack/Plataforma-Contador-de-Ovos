/**
 * Monta um MetricStore a partir de daily_metrics (para o motor rodar regras, retratos e causas ao vivo
 * sem recalcular o histórico).
 */
import type postgres from "postgres";
import { MetricStore } from "@/engine/metrics/store";
import type { Phase } from "@/lib/dates";

type Sql = ReturnType<typeof postgres>;
const d10 = (v: unknown) => (typeof v === "string" ? v.slice(0, 10) : (v as Date).toISOString().slice(0, 10));

export async function loadMetricStore(sql: Sql, opts: { from: string; to: string; metrics?: string[]; houses?: string[] }): Promise<MetricStore> {
  const houses = (await sql`select id, code from app.houses order by sort_order`).filter((h) => !opts.houses || opts.houses.includes(h.code));
  const flocks = await sql`select id, code from app.flocks`;
  const flockCode = new Map(flocks.map((f) => [f.id as string, f.code as string]));
  const codeById = new Map(houses.map((h) => [h.id as string, h.code as string]));
  const store = new MetricStore(opts.from, opts.to, houses.map((h) => h.code as string));
  const rows = await sql`select house_id, flock_id, date, age_days, age_week, phase, metric_code, value, numerator, denominator, quality_flag
    from app.daily_metrics where date between ${opts.from} and ${opts.to}
    ${opts.metrics ? sql`and metric_code in ${sql(opts.metrics)}` : sql``}
    and house_id in ${sql(houses.map((h) => h.id as string))}`;
  for (const r of rows) {
    const h = codeById.get(r.house_id)!;
    const date = d10(r.date);
    const i = store.idx(date);
    const meta = store.meta.get(h)!;
    meta.flock[i] = flockCode.get(r.flock_id) ?? null;
    meta.ageDays[i] = Number(r.age_days);
    meta.ageWeek[i] = Number(r.age_week);
    meta.phase[i] = r.phase as Phase;
    store.setByIndex(h, r.metric_code, i, r.value == null ? null : Number(r.value), r.numerator == null ? null : Number(r.numerator), r.denominator == null ? null : Number(r.denominator), Number(r.quality_flag));
  }
  return store;
}
