import type postgres from "postgres";
import type { DB } from "../../src/db/client";
import type { SimCalendar } from "../../src/simulator/calendar";
import { generateDataset } from "../../src/simulator/generate";
import { calibrateFinance } from "../../src/simulator/calibrate";
import { eventRows, writeDataset } from "../../src/server/repositories/dataset-writer";
import type { Dataset } from "../../src/engine/types";
import { copyRows, insertBatched } from "./db-write";
import { computeAndWriteMetrics } from "./metrics-step";
import { computeAndWriteImpacts } from "./impacts-step";
import { applyDemoStatesAndWrite, detectionTable, runBacktest } from "./alerts-step";
import type { MetricsResult } from "../../src/engine/metrics/pipeline";

export interface PipelineCtx {
  sql: ReturnType<typeof postgres>;
  db: DB;
  cal: SimCalendar;
  step: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
}

export interface PipelineState {
  ds: Dataset;
  metrics: MetricsResult;
}

/** Passos 4 a 12 do reset. */
export async function runPipelineAfterBase(ctx: PipelineCtx): Promise<PipelineState> {
  const { sql, cal, step } = ctx;
  const bulk = (t: string, rows: Record<string, unknown>[]) => copyRows(sql, t, rows);
  const ins = (t: string, rows: Record<string, unknown>[]) => insertBatched(sql, t, rows);

  const ds = await step("4. Simulação (3 anos em memória) e gravação dos dados brutos", async () => {
    const calib = calibrateFinance(cal.seed, cal.dEnd);
    console.log(`\n    calibração (Parte 7.10): ${calib.ok ? "ok" : "PARCIAL"} · ovo nas 6 últimas semanas R$ ${calib.calibEgg.map((v) => v.toFixed(2).replace(".", ",")).join(" · ")} · ajuste do L107 ${calib.l107} p.p.`);
    (ctx as unknown as { calib: typeof calib }).calib = calib;
    const d = generateDataset({ seed: cal.seed, dEnd: cal.dEnd, dStart: cal.dStart, calibEgg: calib.calibEgg, qualityOffset: { L107: calib.l107 } });
    const counts = await writeDataset(sql, d, bulk, ins, { includeEvents: false });
    console.log("\n   ", Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(" "));
    return d;
  });

  await step("5. Eventos semeados", async () => {
    const er = eventRows(ds.events);
    await ins("events", er.ev);
    await ins("event_scopes", er.scopes);
    await ins("event_certainty_history", er.history);
    return er.ev.length;
  });

  const metrics = await step("6. Indicadores diários, semanais, da granja e padrões internos", () => computeAndWriteMetrics(sql, ds));

  await step("7. Retratos de impacto dos eventos", () => computeAndWriteImpacts(sql, ds, metrics));

  const aw = await step("8. Backtest do motor de alertas (dia a dia, sem olhar o futuro) e incidentes", async () => runBacktest(ds, metrics));
  await step("9. Hipóteses, decomposição e casos parecidos", async () => {
    const { computeAlertInsights } = await import("./insights-step");
    await computeAlertInsights(ds, metrics, aw);
  });
  await step("10. Estados de demonstração", () => applyDemoStatesAndWrite(sql, ds, aw));

  await ins("system_state", [
    { key: "simulation", value: { seed: cal.seed, dStart: cal.dStart, anchorEnd: cal.dEnd, lastDay: ds.dEnd, calibEgg: (ctx as unknown as { calib: { calibEgg: number[] } }).calib.calibEgg, l107: (ctx as unknown as { calib: { l107: number } }).calib.l107 } },
  ]);
  const table = detectionTable(aw);
  console.log("\n12. Cenário → detectado?");
  for (const r of table) console.log(`    ${r.ok ? "✓" : "✗"} ${r.code.padEnd(3)} ${r.name.padEnd(44)} ${r.result}${r.rules ? ` (${r.rules})` : ""}`);
  const tables = ["daily_records", "egg_counts", "sensor_readings", "daily_metrics", "weekly_metrics", "events", "event_impacts", "alerts", "incidents", "report_runs"];
  const counts: string[] = [];
  for (const t of tables) {
    const [{ n }] = await sql.unsafe(`select count(*)::int as n from app.${t}`);
    counts.push(`${t}=${n}`);
  }
  console.log("    Linhas por tabela:", counts.join(" "));
  return { ds, metrics };
}
