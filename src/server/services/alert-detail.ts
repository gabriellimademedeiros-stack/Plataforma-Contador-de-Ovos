import "server-only";
import { notFound } from "next/navigation";
import { getSql } from "@/db/client";
import { addDays, ageDays, minDate } from "@/lib/dates";
import { HOUSE_COLORS } from "@/lib/colors";
import { METRIC_BY_CODE } from "@/engine/metrics/catalog";
import { RULE_BY_CODE } from "@/engine/alerts/rules";
import type { Scope } from "@/server/permissions";
import { currentFlockOf, getFlocks, getRefDate } from "@/server/repositories/reference";
import { eventMarks, listEvents } from "@/server/repositories/marks";
import type { ChartSpec } from "@/components/charts/types";
import { readDaily } from "./metrics-query";
import { assertAlertAccess } from "./alerts";

const d10 = (v: unknown) => (v == null ? null : typeof v === "string" ? v.slice(0, 10) : (v as Date).toISOString().slice(0, 10));

export interface HypothesisView {
  code: string;
  name: string;
  score: number;
  confidence: "alta" | "media" | "baixa";
  confidenceReason?: string;
  for: Array<{ signal: string; text: string; weight: number }>;
  against: Array<{ signal: string; text: string; weight: number }>;
  absent: Array<{ signal: string; text: string; weight: number }>;
  unverifiable: Array<{ signal: string; text: string }>;
  bonus: Array<{ signal: string; text: string; points: number }>;
  checks: string[];
}

export async function getAlertDetail(scope: Scope, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const sql = getSql();
  const [a] = await sql`select a.*, h.code as house, f.code as flock, u1.name as ack_name, u2.name as resolved_name, i.title as incident_title, i.scope as incident_scope
    from app.alerts a left join app.houses h on h.id = a.house_id left join app.flocks f on f.id = a.flock_id
    left join app.users u1 on u1.id = a.ack_by left join app.users u2 on u2.id = a.resolved_by left join app.incidents i on i.id = a.incident_id where a.id = ${id}`;
  if (!a) notFound();
  assertAlertAccess(scope, a as unknown as { house: string | null; rule_code: string });
  const refDate = await getRefDate();
  const flocks = await getFlocks();
  const house = a.house as string | null;
  const firstDev = d10(a.first_deviation_on)!;
  const fl = house ? currentFlockOf(flocks, house, firstDev) : undefined;
  const rule = RULE_BY_CODE[a.rule_code];
  const metric = (a.metric_code as string | null) ?? rule?.metric ?? null;
  const from = addDays(firstDev, -21);
  const to = minDate(refDate, addDays(d10(a.last_seen_on)!, 10));
  let observedChart: ChartSpec | null = null;
  let panel: ChartSpec[] = [];
  if (house && metric && !metric.startsWith("fin.") && a.rule_code !== "P01") {
    const metrics = Array.from(new Set([metric, "amb.temp_max", "nut.racao", "nut.agua", "prod.postura", ...(metric === "qual.razao_pistas" ? ["qual.trincados_pista1", "qual.trincados_pista2"] : [])]));
    const rows = await readDaily(scope, { houses: [house], metrics, from, to });
    const others = await readDaily(scope, { metrics: [metric === "qual.razao_pistas" ? "qual.trincados" : metric], from, to });
    const events = await listEvents({ houses: [house], from, to });
    const ev = eventMarks(events);
    const def = METRIC_BY_CODE[metric];
    const frozen = (a.evidence?.frozen_ref as number | null) ?? null;
    const series = metric === "qual.razao_pistas"
      ? [
          { name: "Trincados pista 1", data: rows.filter((r) => r.metric === "qual.trincados_pista1").map((r) => [r.date, r.value] as [string, number | null]), color: "#2563eb" },
          { name: "Trincados pista 2", data: rows.filter((r) => r.metric === "qual.trincados_pista2").map((r) => [r.date, r.value] as [string, number | null]), color: "#ea580c" },
        ]
      : [{ name: `${house}`, data: rows.filter((r) => r.metric === metric).map((r) => [r.date, r.value] as [string, number | null]), color: HOUSE_COLORS[house] }];
    observedChart = {
      kind: "timeseries",
      title: `O que foi observado — ${metric === "qual.razao_pistas" ? "trincados por pista" : def.short}`,
      unit: metric === "qual.razao_pistas" ? "%" : def.unit,
      decimals: def.decimals,
      series,
      refLines: frozen != null && metric !== "qual.razao_pistas" ? [{ name: `referência na abertura (${frozen.toFixed(def.decimals).replace(".", ",")})`, y: frozen, color: "#6b7280", dashed: true }] : [],
      events: [{ id: "", label: "1º desvio", category: "detectado", from: firstDev, to: null }, ...ev],
      alerts: [{ id: a.id, label: a.title, x: d10(a.opened_on)!, y: rows.find((r) => r.metric === metric && r.date === d10(a.opened_on))?.value ?? null, severity: a.severity }],
      context: { alerta: a.id, galpao: house, metrica: metric },
    };
    const om = METRIC_BY_CODE[metric === "qual.razao_pistas" ? "qual.trincados" : metric];
    const otherHouses: ChartSpec = {
      kind: "timeseries",
      title: `Outros galpões — ${om.short}`,
      unit: om.unit,
      decimals: om.decimals,
      series: [...new Set(others.map((r) => r.house))].map((h) => ({ name: h, color: HOUSE_COLORS[h], width: h === house ? 3 : 1, data: others.filter((r) => r.house === h).map((r) => [r.date, r.value] as [string, number | null]) })),
    };
    const pick = (m: string, title: string, color: string, unit: string, dec: number): ChartSpec => ({ kind: "timeseries", title, unit, decimals: dec, series: [{ name: title, color, data: rows.filter((r) => r.metric === m).map((r) => [r.date, r.value]) }], events: ev });
    panel = [pick("amb.temp_max", "Temperatura máxima interna", "#dc2626", "°C", 1), pick("nut.racao", "Ração por ave", "#a16207", "g/ave/dia", 1), pick("nut.agua", "Água por ave", "#0284c7", "mL/ave/dia", 0), pick("prod.postura", "Postura", HOUSE_COLORS[house], "%", 1), otherHouses];
  }
  const [question] = await sql`select q.*, u.name as answered_name from app.anomaly_questions q left join app.users u on u.id = q.answered_by where q.alert_id = ${id} order by q.asked_at desc limit 1`;
  const links = await sql`select e.id, e.title, e.type_code, e.certainty from app.event_links l join app.events e on e.id = l.event_id where l.alert_id = ${id}`;
  const history = await sql`select l.action, l.at, l.after, u.name from app.audit_log l left join app.users u on u.id = l.user_id where l.entity = 'alerts' and l.entity_id = ${id} order by l.at`;
  const timeline: Array<{ at: string; text: string }> = [
    { at: d10(a.first_deviation_on)!, text: "Primeiro dia do desvio" },
    { at: new Date(a.opened_at).toISOString(), text: `Alerta aberto (regra ${a.rule_code})` },
  ];
  if (a.ack_at) timeline.push({ at: new Date(a.ack_at).toISOString(), text: `Reconhecido por ${a.ack_name ?? "—"}` });
  if (a.evidence?.condition_cleared_on) timeline.push({ at: String(a.evidence.condition_cleared_on), text: "Condição normalizada" });
  if (a.status === "em_investigacao") timeline.push({ at: a.ack_at ? new Date(a.ack_at).toISOString() : d10(a.opened_on)!, text: "Em investigação" });
  if (a.resolved_at) timeline.push({ at: new Date(a.resolved_at).toISOString(), text: `${a.status === "descartado" ? "Descartado" : "Resolvido"} por ${a.resolved_name ?? "—"}` });
  if (a.reopened_count > 0) timeline.push({ at: d10(a.last_seen_on)!, text: `Reaberto ${a.reopened_count} vez(es)` });
  for (const h of history) timeline.push({ at: new Date(h.at).toISOString(), text: `${h.name ?? "—"}: ${h.action}` });
  timeline.sort((x, y) => (x.at < y.at ? -1 : 1));
  return {
    id: a.id as string,
    rule: a.rule_code as string,
    ruleName: rule?.name ?? a.rule_code,
    ruleDescription: rule?.description ?? "",
    title: a.title as string,
    severity: a.severity as string,
    status: a.status as string,
    house,
    flock: (a.flock as string | null) ?? fl?.code ?? null,
    strain: fl?.strainName ?? null,
    ageDays: fl ? ageDays(d10(a.opened_on)!, fl.hatchDate) : null,
    firstDeviationOn: firstDev,
    openedOn: d10(a.opened_on)!,
    openedAt: new Date(a.opened_at).toISOString(),
    lastSeenOn: d10(a.last_seen_on)!,
    closedOn: d10(a.closed_on),
    conditionClearedOn: (a.evidence?.condition_cleared_on as string | undefined) ?? null,
    observed: a.observed as Record<string, unknown>,
    metric,
    hypotheses: (a.hypotheses ?? []) as HypothesisView[],
    decomposition: a.decomposition as null | Record<string, unknown>,
    similar: (a.similar_cases ?? []) as Array<Record<string, unknown>>,
    whatToKnow: (a.evidence?.what_to_know ?? []) as string[],
    explanation: (a.evidence?.explanation ?? null) as string | null,
    atOpening: (a.evidence?.hypotheses_at_opening ?? []) as HypothesisView[],
    causeCode: a.cause_code as string | null,
    causeNote: a.cause_note as string | null,
    actionTaken: a.action_taken as string | null,
    wasUseful: a.was_useful as boolean | null,
    discardReason: a.discard_reason as string | null,
    silencedUntil: d10(a.silenced_until),
    incident: a.incident_id ? { id: a.incident_id as string, title: a.incident_title as string, scope: a.incident_scope as string } : null,
    observedChart,
    panel,
    question: question
      ? { id: question.id as string, question: question.question as string, options: question.options as Array<{ code: string; label: string }>, answered: question.answered_at ? { code: question.answer_code as string, by: question.answered_name as string | null, at: new Date(question.answered_at).toISOString() } : null, house: house ?? "" }
      : null,
    links: links.map((l) => ({ id: l.id as string, title: l.title as string, type: l.type_code as string, certainty: l.certainty as string })),
    timeline,
    source: a.source as string,
  };
}

export async function getAlertCenter(scope: Scope, opts: { tab: string; house?: string | null; rule?: string | null; severity?: string | null; from: string; to: string }) {
  const sql = getSql();
  const statuses: Record<string, string[]> = { abertos: ["aberto", "reconhecido"], investigacao: ["em_investigacao"], resolvidos: ["resolvido"], descartados: ["descartado"] };
  const houses = [...scope.houseCodes].filter((h) => !opts.house || h === opts.house);
  const { listAlerts } = await import("@/server/repositories/marks");
  const list = opts.tab === "incidentes" ? [] : await listAlerts({ houses, includeFarm: !opts.house, statuses: statuses[opts.tab] ?? statuses.abertos, rules: opts.rule ? [opts.rule] : undefined, severities: opts.severity ? [opts.severity] : undefined, from: ["abertos", "investigacao"].includes(opts.tab) ? undefined : opts.from, to: opts.to, canSeeFinance: scope.canSeeFinance });
  const ids = [...scope.houseIds];
  const stats = await sql`select rule_code, count(*)::int as total, count(*) filter (where was_useful)::int as useful, count(*) filter (where was_useful = false)::int as not_useful,
      count(*) filter (where status in ('aberto','reconhecido','em_investigacao'))::int as open
    from app.alerts where (house_id is null or house_id in ${sql(ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])}) and (${scope.canSeeFinance} or rule_code <> 'A22') group by rule_code order by rule_code`;
  const incidents =
    opts.tab === "incidentes"
      ? await sql`select i.*, h.code as house, (select count(*)::int from app.alerts a where a.incident_id = i.id) as n,
            (select json_agg(json_build_object('id', a.id, 'title', a.title, 'house', h2.code, 'status', a.status) order by a.opened_on) from app.alerts a left join app.houses h2 on h2.id = a.house_id where a.incident_id = i.id) as alerts
          from app.incidents i left join app.houses h on h.id = i.house_id where (i.house_id is null or i.house_id in ${sql(ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])}) order by i.opened_on desc limit 100`
      : [];
  const counts = await sql`select status, count(*)::int as n from app.alerts where (house_id is null or house_id in ${sql(ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])}) and (${scope.canSeeFinance} or rule_code <> 'A22') group by status`;
  const cnt = (s: string[]) => counts.filter((c) => s.includes(c.status)).reduce((x, c) => x + Number(c.n), 0);
  return {
    list,
    stats: stats.map((s) => ({ rule: s.rule_code as string, name: RULE_BY_CODE[s.rule_code]?.name ?? s.rule_code, total: Number(s.total), useful: Number(s.useful), notUseful: Number(s.not_useful), open: Number(s.open) })),
    incidents: incidents.map((i) => ({ id: i.id as string, title: i.title as string, scope: i.scope as string, house: i.house as string | null, openedOn: d10(i.opened_on)!, closedOn: d10(i.closed_on), status: i.status as string, n: Number(i.n), alerts: (i.alerts ?? []) as Array<{ id: string; title: string; house: string | null; status: string }> })),
    counts: { abertos: cnt(["aberto", "reconhecido"]), investigacao: cnt(["em_investigacao"]), resolvidos: cnt(["resolvido"]), descartados: cnt(["descartado"]) },
  };
}
