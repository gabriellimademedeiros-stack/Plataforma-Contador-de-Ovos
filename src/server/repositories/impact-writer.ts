import type postgres from "postgres";
import { houseIdFor } from "@/lib/ids";
import type { EventImpactResult } from "@/engine/impacts/impact";
import type { Row } from "./dataset-writer";

type Sql = ReturnType<typeof postgres>;
const r6 = (v: number | null) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 1e6) / 1e6);

export function impactRows(eventId: string, r: EventImpactResult, at: string) {
  const impacts: Row[] = r.rows.map((x) => ({
    event_id: eventId,
    house_id: houseIdFor(x.house),
    metric_code: x.metric,
    is_control: x.isControl,
    base_mean: r6(x.baseMean),
    base_robust_sd: r6(x.baseRobustSd),
    effect_mean: r6(x.effectMean),
    delta_abs: r6(x.deltaAbs),
    delta_pct: r6(x.deltaPct),
    z: r6(x.z),
    worst_value: r6(x.worstValue),
    lag_days: x.lagDays,
    recovery_days: x.recoveryDays,
    loss_eggs: r6(x.lossEggs),
    loss_brl: r6(x.lossBrl),
    window_closed: x.windowClosed,
    computed_at: at,
  }));
  const fps: Row[] = r.fingerprints.map((f) => ({ event_id: eventId, house_id: houseIdFor(f.house), vector: f.vector.map((v) => (v == null ? null : Math.round(v * 1000) / 1000)), computed_at: at }));
  const meta = { summary: r.summary, summaries: r.summaries, controlDiff: r.controlDiff, allFarm: r.allFarm, windows: r.windows };
  return { impacts, fps, meta };
}

/** Substitui o retrato de um evento (usado pela API e pelo avanço diário). */
export async function saveEventImpact(sql: Sql, eventId: string, r: EventImpactResult) {
  const at = new Date().toISOString();
  const { impacts, fps, meta } = impactRows(eventId, r, at);
  await sql.begin(async (tx) => {
    await tx`delete from app.event_impacts where event_id = ${eventId}`;
    await tx`delete from app.event_fingerprints where event_id = ${eventId}`;
    if (impacts.length) await tx`insert into app.event_impacts ${tx(impacts as never, Object.keys(impacts[0]))}`;
    for (const f of fps) await tx`insert into app.event_fingerprints (event_id, house_id, vector, computed_at) values (${f.event_id as string}, ${f.house_id as string}, ${`{${(f.vector as (number | null)[]).map((v) => v ?? 0).join(",")}}`}::real[], ${at})`;
    await tx`update app.events set details = jsonb_set(jsonb_set(coalesce(details, '{}'::jsonb), '{impact_summary}', ${JSON.stringify(r.summary)}::jsonb), '{impact_meta}', ${JSON.stringify(meta)}::jsonb) where id = ${eventId}`;
  });
}
