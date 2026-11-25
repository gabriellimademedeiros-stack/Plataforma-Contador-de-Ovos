import { farmInstant } from "@/lib/dates";
import { TENANT_ID, flockIdFor, houseIdFor } from "@/lib/ids";
import type { EngineAlert } from "@/engine/alerts/engine";
import type { AlertFinalState } from "@/simulator/demo-states";
import type { Row } from "./dataset-writer";

/** Linha da tabela alerts a partir do alerta do motor e do estado final. */
export function alertRow(a: EngineAlert, st: Partial<AlertFinalState> = {}, incidentId: string | null = null): Row {
  const openedAt = farmInstant(a.openedOn, a.rule === "A11" ? 15 : a.rule === "P01" ? 6 : 8, a.rule === "P01" ? 30 : 30).toISOString();
  return {
    id: a.id,
    tenant_id: TENANT_ID,
    rule_code: a.rule,
    house_id: a.house ? houseIdFor(a.house) : null,
    flock_id: a.flock ? flockIdFor(a.flock) : null,
    metric_code: a.metric,
    anomaly_type: a.anomalyType,
    first_deviation_on: a.firstDeviationOn,
    opened_on: a.openedOn,
    opened_at: openedAt,
    last_seen_on: a.lastSeenOn,
    closed_on: st.closedOn ?? null,
    status: st.status ?? "aberto",
    severity: a.severity,
    title: a.title,
    observed: a.observed,
    evidence: { ...a.evidence, frozen_ref: a.frozenRef, scenario: st.scenario ?? null },
    hypotheses: [],
    decomposition: null,
    similar_cases: [],
    incident_id: incidentId,
    ack_by: st.ackBy ?? null,
    ack_at: st.ackOn ? farmInstant(st.ackOn, 9, 15).toISOString() : null,
    resolved_by: st.resolvedBy ?? null,
    resolved_at: st.closedOn && (st.status === "resolvido" || st.status === "descartado") ? farmInstant(st.closedOn, 17, 0).toISOString() : null,
    cause_code: st.causeCode ?? null,
    cause_note: st.causeNote ?? null,
    action_taken: st.actionTaken ?? null,
    was_useful: st.wasUseful ?? null,
    discard_reason: st.discardReason ?? null,
    reopened_count: a.reopenedCount,
    silenced_until: st.silencedUntil ?? null,
    source: a.source,
  };
}
