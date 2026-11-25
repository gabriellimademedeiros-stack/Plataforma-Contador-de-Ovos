import type postgres from "postgres";
import type { Dataset } from "../../src/engine/types";
import type { MetricsResult } from "../../src/engine/metrics/pipeline";
import { computeAllImpacts } from "../../src/engine/impacts/run";
import { impactRows } from "../../src/server/repositories/impact-writer";
import { copyRows } from "./db-write";

type Sql = ReturnType<typeof postgres>;

/** Passo 7: retratos de impacto de todos os eventos. */
export async function computeAndWriteImpacts(sql: Sql, ds: Dataset, m: MetricsResult) {
  const results = computeAllImpacts(ds, m);
  const at = new Date().toISOString();
  const impacts: Record<string, unknown>[] = [];
  const fps: Record<string, unknown>[] = [];
  await sql`truncate app.event_impacts, app.event_fingerprints`;
  for (const [id, r] of results) {
    const x = impactRows(id, r, at);
    impacts.push(...x.impacts);
    fps.push(...x.fps.map((f) => ({ ...f, vector: (f.vector as (number | null)[]).map((v) => v ?? 0) })));
    await sql`update app.events set details = coalesce(details, '{}'::jsonb) || ${JSON.stringify({ impact_summary: r.summary, impact_meta: { summary: r.summary, summaries: r.summaries, controlDiff: r.controlDiff, allFarm: r.allFarm, windows: r.windows } })}::jsonb where id = ${id}`;
  }
  await copyRows(sql, "event_impacts", impacts);
  await copyRows(sql, "event_fingerprints", fps);
  const s7 = ds.events.find((e) => e.scenario === "S7");
  console.log(`\n    retratos: ${results.size} eventos, ${impacts.length} linhas; S7: "${s7 ? results.get(s7.id)?.summary : "—"}"`);
  return results;
}
