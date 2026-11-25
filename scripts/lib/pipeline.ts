import type postgres from "postgres";
import type { DB } from "../../src/db/client";
import type { SimCalendar } from "../../src/simulator/calendar";
import { generateDataset } from "../../src/simulator/generate";
import { eventRows, writeDataset } from "../../src/server/repositories/dataset-writer";
import type { Dataset } from "../../src/engine/types";
import { copyRows, insertBatched } from "./db-write";

export interface PipelineCtx {
  sql: ReturnType<typeof postgres>;
  db: DB;
  cal: SimCalendar;
  step: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
}

export interface PipelineState {
  ds: Dataset;
}

/** Passos 4 a 12 do reset. */
export async function runPipelineAfterBase(ctx: PipelineCtx): Promise<PipelineState> {
  const { sql, cal, step } = ctx;
  const bulk = (t: string, rows: Record<string, unknown>[]) => copyRows(sql, t, rows);
  const ins = (t: string, rows: Record<string, unknown>[]) => insertBatched(sql, t, rows);

  const ds = await step("4. Simulação (3 anos em memória) e gravação dos dados brutos", async () => {
    const d = generateDataset({ seed: cal.seed, dEnd: cal.dEnd, dStart: cal.dStart });
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

  await ins("system_state", [
    { key: "simulation", value: { seed: cal.seed, dStart: cal.dStart, anchorEnd: cal.dEnd, lastDay: ds.dEnd } },
  ]);
  return { ds };
}
