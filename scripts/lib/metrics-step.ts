import type postgres from "postgres";
import type { Dataset } from "../../src/engine/types";
import { computeAllMetrics, type MetricsResult } from "../../src/engine/metrics/pipeline";
import { lastCompleteWeekStart, weekLabel } from "../../src/lib/dates";
import { fmtPct } from "../../src/lib/format";
import {
  dailyMetricRows,
  farmDailyRows,
  farmWeeklyRows,
  internalStandardRows,
  weeklyMetricRows,
} from "../../src/server/repositories/metrics-writer";
import { copyRows } from "./db-write";

type Sql = ReturnType<typeof postgres>;

/** Passo 6: indicadores diários, semanais, da granja e padrões internos. */
export async function computeAndWriteMetrics(sql: Sql, ds: Dataset): Promise<MetricsResult> {
  const r = computeAllMetrics(ds);
  const at = new Date().toISOString();
  await sql`truncate app.daily_metrics, app.weekly_metrics, app.farm_daily_metrics, app.farm_weekly_metrics, app.internal_standards`;
  const n1 = await copyRows(sql, "daily_metrics", dailyMetricRows(r.store, at));
  const n2 = await copyRows(sql, "weekly_metrics", weeklyMetricRows(r.weekly, at));
  const n3 = await copyRows(sql, "farm_daily_metrics", farmDailyRows(r.farmDaily, at));
  const n4 = await copyRows(sql, "farm_weekly_metrics", farmWeeklyRows(r.farmWeekly, at));
  const n5 = await copyRows(sql, "internal_standards", internalStandardRows(r.internalRows));
  const ws = lastCompleteWeekStart(ds.dEnd);
  const p = r.farmWeekly.find((x) => x.key === ws && x.metric === "prod.postura");
  const nOk = r.internalRows.filter((x) => x.metric === "prod.postura" && x.nFlocks >= 3).length;
  const excl = r.internalRows.filter((x) => x.metric === "prod.postura").reduce((a, x) => a + x.excludedWeeks, 0);
  console.log(`\n    daily_metrics=${n1} weekly_metrics=${n2} farm_daily=${n3} farm_weekly=${n4} internal_standards=${n5}`);
  console.log(`    padrão interno de postura: ${nOk} semanas-linhagem com 3+ lotes; ${excl} semanas excluídas (eventos sanitários e calor)`);
  console.log(`    Postura média da granja — ${weekLabel(ws)}: ${fmtPct(p?.value ?? null)} (Σ ovos ÷ Σ aves-dia)`);
  return r;
}
