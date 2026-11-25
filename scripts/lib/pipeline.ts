import type postgres from "postgres";
import type { DB } from "../../src/db/client";
import type { SimCalendar } from "../../src/simulator/calendar";

export interface PipelineCtx {
  sql: ReturnType<typeof postgres>;
  db: DB;
  cal: SimCalendar;
  step: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
}

/** Passos 4 a 12 do reset (preenchidos marco a marco). */
export async function runPipelineAfterBase(_ctx: PipelineCtx): Promise<void> {}
