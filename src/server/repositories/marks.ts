import "server-only";
import { getSql } from "@/db/client";
import { productiveDate } from "@/lib/dates";
import type { AlertMark, EventMark } from "@/components/charts/types";

export interface EventListItem {
  id: string;
  typeCode: string;
  category: string;
  typeName: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  startDate: string;
  endDate: string | null;
  certainty: string;
  severity: string;
  source: string;
  houses: string[];
  description: string | null;
  details: Record<string, unknown>;
}

/** Eventos que tocam um conjunto de galpões num período (dias produtivos). */
export async function listEvents(opts: { houses: string[]; from?: string; to?: string; categories?: string[]; certainty?: string[]; source?: string[] }): Promise<EventListItem[]> {
  const sql = getSql();
  if (!opts.houses.length) return [];
  const rows = await sql`
    select e.id, e.type_code, t.category, t.name_pt, e.title, e.starts_at, e.ends_at, e.certainty, e.severity, e.source, e.description, e.details,
      array_agg(h.code order by h.code) as houses
    from app.events e join app.event_types t on t.code = e.type_code
    join app.event_scopes s on s.event_id = e.id join app.houses h on h.id = s.house_id
    where h.code in ${sql(opts.houses)}
      ${opts.from ? sql`and coalesce(e.ends_at, e.starts_at) >= (${opts.from}::date + interval '6 hours') at time zone 'America/Fortaleza'` : sql``}
      ${opts.to ? sql`and e.starts_at < (${opts.to}::date + interval '30 hours') at time zone 'America/Fortaleza'` : sql``}
      ${opts.categories?.length ? sql`and t.category in ${sql(opts.categories)}` : sql``}
      ${opts.certainty?.length ? sql`and e.certainty in ${sql(opts.certainty)}` : sql``}
      ${opts.source?.length ? sql`and e.source in ${sql(opts.source)}` : sql``}
    group by e.id, t.category, t.name_pt order by e.starts_at desc`;
  return rows.map((r) => {
    const s = new Date(r.starts_at).toISOString();
    const e = r.ends_at ? new Date(r.ends_at).toISOString() : null;
    return {
      id: r.id,
      typeCode: r.type_code,
      category: r.category,
      typeName: r.name_pt,
      title: r.title,
      startsAt: s,
      endsAt: e,
      startDate: productiveDate(new Date(s)),
      endDate: e ? productiveDate(new Date(e)) : null,
      certainty: r.certainty,
      severity: r.severity,
      source: r.source,
      houses: r.houses,
      description: r.description,
      details: r.details ?? {},
    };
  });
}

export function eventMarks(events: EventListItem[], axis: "data" | "idade" = "data", ageOf?: (date: string) => number | null): EventMark[] {
  return events
    .filter((e) => e.certainty !== "descartado")
    .map((e) => {
      const from = axis === "idade" && ageOf ? ageOf(e.startDate) : e.startDate;
      const to = e.endDate && e.endDate !== e.startDate ? (axis === "idade" && ageOf ? ageOf(e.endDate) : e.endDate) : null;
      return { id: e.id, label: e.title, category: e.category, from: from ?? e.startDate, to };
    });
}

export interface AlertListItem {
  id: string;
  ruleCode: string;
  title: string;
  severity: string;
  status: string;
  house: string | null;
  metricCode: string | null;
  firstDeviationOn: string;
  openedOn: string;
  closedOn: string | null;
  lastSeenOn: string;
  topHypothesis: { code: string; name: string; confidence: string; score: number } | null;
  causeCode: string | null;
  wasUseful: boolean | null;
}

const d10 = (v: unknown) => (v == null ? null : typeof v === "string" ? v.slice(0, 10) : (v as Date).toISOString().slice(0, 10));

export async function listAlerts(opts: {
  houses: string[];
  includeFarm?: boolean;
  from?: string;
  to?: string;
  statuses?: string[];
  rules?: string[];
  severities?: string[];
  canSeeFinance: boolean;
  limit?: number;
}): Promise<AlertListItem[]> {
  const sql = getSql();
  const rows = await sql`
    select a.id, a.rule_code, a.title, a.severity, a.status, h.code as house, a.metric_code, a.first_deviation_on, a.opened_on, a.closed_on,
      a.last_seen_on, a.hypotheses, a.cause_code, a.was_useful
    from app.alerts a left join app.houses h on h.id = a.house_id
    where (h.code in ${sql(opts.houses.length ? opts.houses : ["__"])} ${opts.includeFarm !== false ? sql`or a.house_id is null` : sql``})
      ${opts.from ? sql`and coalesce(a.closed_on, a.last_seen_on) >= ${opts.from}` : sql``}
      ${opts.to ? sql`and a.opened_on <= ${opts.to}` : sql``}
      ${opts.statuses?.length ? sql`and a.status in ${sql(opts.statuses)}` : sql``}
      ${opts.rules?.length ? sql`and a.rule_code in ${sql(opts.rules)}` : sql``}
      ${opts.severities?.length ? sql`and a.severity in ${sql(opts.severities)}` : sql``}
      and (${opts.canSeeFinance} or a.rule_code <> 'A22')
    order by a.opened_on desc, a.opened_at desc
    limit ${opts.limit ?? 500}`;
  return rows.map((r) => {
    const h = Array.isArray(r.hypotheses) && r.hypotheses.length ? r.hypotheses[0] : null;
    return {
      id: r.id,
      ruleCode: r.rule_code,
      title: r.title,
      severity: r.severity,
      status: r.status,
      house: r.house,
      metricCode: r.metric_code,
      firstDeviationOn: d10(r.first_deviation_on)!,
      openedOn: d10(r.opened_on)!,
      closedOn: d10(r.closed_on),
      lastSeenOn: d10(r.last_seen_on)!,
      topHypothesis: h ? { code: h.code, name: h.name, confidence: h.confidence, score: h.score } : null,
      causeCode: r.cause_code,
      wasUseful: r.was_useful,
    };
  });
}

export function alertMarks(alerts: AlertListItem[], yOf: (a: AlertListItem) => number | null): AlertMark[] {
  return alerts.map((a) => ({ id: a.id, label: a.title, x: a.openedOn, y: yOf(a), severity: a.severity }));
}
