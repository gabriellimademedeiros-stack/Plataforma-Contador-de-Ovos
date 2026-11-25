import "server-only";
import { getSql } from "@/db/client";
import { addDays } from "@/lib/dates";
import type { Scope } from "@/server/permissions";
import { getRefDate } from "@/server/repositories/reference";
import { readDaily, windowAggregate } from "./metrics-query";

const NIL = "00000000-0000-0000-0000-000000000000";
const ids = (s: Scope) => (s.houseIds.size ? [...s.houseIds] : [NIL]);

export interface HomeAlert {
  id: string;
  title: string;
  severity: string;
  status: string;
  house: string | null;
  ruleCode: string;
  openedAt: string;
  ackAt: string | null;
  topHypothesis: { name: string; confidence: string } | null;
  escalated: boolean;
}

export async function getOpenAlerts(scope: Scope, limit = 12): Promise<HomeAlert[]> {
  const sql = getSql();
  const rows = await sql`
    select a.id, a.title, a.severity, a.status, h.code as house, a.rule_code, a.opened_at, a.ack_at, a.hypotheses
    from app.alerts a left join app.houses h on h.id = a.house_id
    where a.status in ('aberto', 'reconhecido', 'em_investigacao') and a.rule_code <> 'P01'
      and (a.house_id is null or a.house_id in ${sql(ids(scope))})
      and (${scope.canSeeFinance} or a.rule_code <> 'A22')
    order by case a.severity when 'critica' then 0 when 'alta' then 1 when 'media' then 2 else 3 end, a.opened_at desc
    limit ${limit}`;
  const now = Date.now();
  return rows.map((r) => {
    const hyp = Array.isArray(r.hypotheses) && r.hypotheses.length ? r.hypotheses[0] : null;
    const openedMs = new Date(r.opened_at).getTime();
    const unack = r.status === "aberto" && !r.ack_at;
    const escalated = unack && ((r.severity === "alta" && now - openedMs > 2 * 3600e3) || (r.severity === "critica" && now - openedMs > 15 * 60e3));
    return {
      id: r.id,
      title: r.title,
      severity: r.severity,
      status: r.status,
      house: r.house,
      ruleCode: r.rule_code,
      openedAt: new Date(r.opened_at).toISOString(),
      ackAt: r.ack_at ? new Date(r.ack_at).toISOString() : null,
      topHypothesis: hyp ? { name: hyp.name, confidence: hyp.confidence } : null,
      escalated,
    };
  });
}

export async function getHeatWarning() {
  const sql = getSql();
  const [r] = await sql`select id, title, observed, evidence from app.alerts where rule_code = 'P01' and status in ('aberto','reconhecido','em_investigacao') order by opened_on desc limit 1`;
  if (!r) return null;
  return { id: r.id as string, title: r.title as string, observed: r.observed as { days?: Array<{ date: string; tempMax: number }>; houses?: Array<{ code: string; coolingDelta: number }> } };
}

export async function getPendingQuestions(scope: Scope) {
  const sql = getSql();
  const rows = await sql`
    select q.id, q.question, q.options, q.asked_at, h.code as house, q.alert_id
    from app.anomaly_questions q join app.houses h on h.id = q.house_id
    where q.answered_at is null and q.house_id in ${sql(ids(scope))}
    order by q.asked_at desc`;
  return rows.map((r) => ({
    id: r.id as string,
    question: r.question as string,
    options: r.options as Array<{ code: string; label: string }>,
    askedAt: new Date(r.asked_at).toISOString(),
    house: r.house as string,
    alertId: r.alert_id as string,
  }));
}

export async function getDataHealth(scope: Scope) {
  const sql = getSql();
  const refDate = await getRefDate();
  const devices = await sql`
    select d.code, d.type, d.status, d.last_seen_at, h.code as house
    from app.devices d join app.device_assignments a on a.device_id = d.id and a.valid_to is null
    join app.houses h on h.id = a.house_id where h.id in ${sql(ids(scope))} order by d.code`;
  const rows = await readDaily(scope, { metrics: ["ops.completude"], from: addDays(refDate, -6), to: refDate });
  const comp = windowAggregate(rows, "ops.completude", addDays(refDate, -6), refDate);
  return {
    completeness: comp.total.value,
    sources: [
      { source: "Contador de ovos", pct: comp.total.value },
      { source: "Sensores de ambiência", pct: 100 },
      { source: "Apontamento diário (sistema da granja)", pct: 100 },
      { source: "Laboratório (semanal)", pct: 100 },
    ],
    problems: devices
      .filter((d) => d.status === "offline")
      .map((d) => ({ code: d.code as string, house: d.house as string, lastSeen: d.last_seen_at ? new Date(d.last_seen_at).toISOString() : null })),
    devices: devices.length,
  };
}
