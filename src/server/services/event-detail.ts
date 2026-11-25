import "server-only";
import { notFound } from "next/navigation";
import { getSql } from "@/db/client";
import { addDays, productiveDate } from "@/lib/dates";
import { HOUSE_COLORS } from "@/lib/colors";
import { METRIC_BY_CODE } from "@/engine/metrics/catalog";
import { FINGERPRINT_METRICS } from "@/engine/impacts/impact";
import { EVENT_TYPE_BY_CODE } from "@/engine/impacts/event-types";
import { median } from "@/engine/stats";
import { PermissionError, type Scope } from "@/server/permissions";
import { getRefDate } from "@/server/repositories/reference";
import type { ChartSpec } from "@/components/charts/types";
import { readDaily } from "./metrics-query";

const n = (v: unknown) => (v == null ? null : Number(v));

export async function getEventDetail(scope: Scope, id: string) {
  const sql = getSql();
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [e] = await sql`select e.*, t.name_pt as type_name, t.category, u.name as author from app.events e join app.event_types t on t.code = e.type_code left join app.users u on u.id = e.created_by where e.id = ${id}`;
  if (!e) notFound();
  const scopes = await sql`select h.code, f.code as flock from app.event_scopes s join app.houses h on h.id = s.house_id left join app.flocks f on f.id = s.flock_id where s.event_id = ${id} order by h.code`;
  const houses = scopes.map((s) => s.code as string);
  if (!houses.some((h) => scope.houseCodes.has(h))) throw new PermissionError("Você não tem acesso aos galpões deste evento.");
  const history = await sql`select c.*, u.name from app.event_certainty_history c left join app.users u on u.id = c.by_user where c.event_id = ${id} order by c.at`;
  const impacts = await sql`select h.code as house, i.* from app.event_impacts i join app.houses h on h.id = i.house_id where i.event_id = ${id}`;
  const fps = await sql`select h.code as house, f.vector from app.event_fingerprints f join app.houses h on h.id = f.house_id where f.event_id = ${id}`;
  const links = await sql`select a.id, a.title, a.status, a.severity, a.rule_code from app.event_links l join app.alerts a on a.id = l.alert_id where l.event_id = ${id}`;
  const meta = (e.details?.impact_meta ?? null) as null | { summary: string; summaries: Record<string, string>; controlDiff: Record<string, Record<string, number | null>>; allFarm: boolean; windows: { baseFrom: string; baseTo: string; effectFrom: string; effectTo: string; effectDays: number; recoveryDays: number; closed: boolean } | null };
  const startDate = productiveDate(new Date(e.starts_at));
  const endDate = e.ends_at ? productiveDate(new Date(e.ends_at)) : null;
  const visible = houses.filter((h) => scope.houseCodes.has(h));
  const main = visible[0];
  // tabela do retrato do galpão principal (ou escolhido)
  const tableFor = (h: string) =>
    FINGERPRINT_METRICS.map((m) => {
      const r = impacts.find((x) => x.house === h && x.metric_code === m && !x.is_control);
      return {
        metric: m,
        name: METRIC_BY_CODE[m].short,
        unit: METRIC_BY_CODE[m].unit,
        decimals: METRIC_BY_CODE[m].decimals,
        base: n(r?.base_mean),
        sd: n(r?.base_robust_sd),
        effect: n(r?.effect_mean),
        delta: n(r?.delta_abs),
        deltaPct: n(r?.delta_pct),
        z: n(r?.z),
        worst: n(r?.worst_value),
        lag: r?.lag_days ?? null,
        recovery: r?.recovery_days ?? null,
        lossEggs: n(r?.loss_eggs),
        lossBrl: scope.canSeeFinance ? n(r?.loss_brl) : null,
        controlDiff: meta?.controlDiff?.[h]?.[m] ?? null,
        controlMedian: median(impacts.filter((x) => x.is_control && x.metric_code === m).map((x) => n(x.delta_abs))),
      };
    });
  // gráfico antes × depois (3 métricas de maior |z|) com o dia 0 marcado
  const refDate = await getRefDate();
  const w = meta?.windows;
  const from = w ? w.baseFrom : addDays(startDate, -14);
  const to = w ? (addDays(startDate, w.effectDays + w.recoveryDays) < refDate ? addDays(startDate, w.effectDays + w.recoveryDays) : refDate) : addDays(startDate, 28);
  const table = main ? tableFor(main) : [];
  const top = [...table].filter((t) => t.z != null).sort((a, b) => Math.abs(b.z!) - Math.abs(a.z!)).slice(0, 3).map((t) => t.metric);
  const chartMetrics = Array.from(new Set(["prod.postura", "nut.agua", ...top])).slice(0, 4);
  const ctrlHouses = [...new Set(impacts.filter((x) => x.is_control).map((x) => x.house as string))].filter((h) => scope.houseCodes.has(h));
  const rows = main ? await readDaily(scope, { houses: [main, ...ctrlHouses], metrics: chartMetrics, from, to }) : [];
  const specs: ChartSpec[] = chartMetrics.map((m) => {
    const ctrlByDate = new Map<string, Array<number | null>>();
    for (const r of rows.filter((r) => r.metric === m && r.house !== main)) {
      const a = ctrlByDate.get(r.date) ?? [];
      a.push(r.value);
      ctrlByDate.set(r.date, a);
    }
    return {
      kind: "timeseries",
      title: METRIC_BY_CODE[m].short,
      unit: METRIC_BY_CODE[m].unit,
      decimals: METRIC_BY_CODE[m].decimals,
      series: [
        { name: main, color: HOUSE_COLORS[main], data: rows.filter((r) => r.metric === m && r.house === main).map((r) => [r.date, r.value]) },
        ...(ctrlHouses.length ? [{ name: "Mediana dos controles", color: "#9ca3af", dashed: true, data: [...ctrlByDate.entries()].sort().map(([d, v]) => [d, median(v)] as [string, number | null]) }] : []),
      ],
      events: [
        { id: "", label: "dia 0", category: e.category, from: startDate, to: null },
        ...(w ? [{ id: "", label: "janela de efeito", category: e.category, from: w.effectFrom, to: w.effectTo }] : []),
      ],
      refLines: [],
    } satisfies ChartSpec;
  });
  return {
    id: e.id as string,
    typeCode: e.type_code as string,
    typeName: e.type_name as string,
    category: e.category as string,
    title: e.title as string,
    startsAt: new Date(e.starts_at).toISOString(),
    endsAt: e.ends_at ? new Date(e.ends_at).toISOString() : null,
    startDate,
    endDate,
    severity: e.severity as string,
    certainty: e.certainty as string,
    confirmedBy: e.confirmed_by as string | null,
    description: e.description as string | null,
    details: Object.fromEntries(Object.entries(e.details ?? {}).filter(([k]) => !k.startsWith("impact_"))) as Record<string, unknown>,
    fields: EVENT_TYPE_BY_CODE[e.type_code]?.fields ?? [],
    actionTaken: e.action_taken as string | null,
    costBrl: scope.canSeeFinance ? n(e.cost_brl) : null,
    source: e.source as string,
    author: e.author as string | null,
    createdAt: new Date(e.created_at).toISOString(),
    completeness: e.completeness as string,
    houses: scopes.map((s) => ({ code: s.code as string, flock: s.flock as string | null, visible: scope.houseCodes.has(s.code) })),
    history: history.map((h) => ({ at: new Date(h.at).toISOString(), from: h.from_certainty as string | null, to: h.to_certainty as string, by: h.name as string | null, note: h.note as string | null })),
    summary: (e.details?.impact_summary as string) ?? null,
    summaries: meta?.summaries ?? {},
    allFarm: meta?.allFarm ?? false,
    windows: w ?? null,
    mainHouse: main,
    table,
    tables: Object.fromEntries(visible.map((h) => [h, tableFor(h)])),
    fingerprints: fps.filter((f) => scope.houseCodes.has(f.house)).map((f) => ({ house: f.house as string, vector: (f.vector as number[]).map(Number) })),
    controls: ctrlHouses,
    links: links.map((l) => ({ id: l.id as string, title: l.title as string, status: l.status as string, severity: l.severity as string, rule: l.rule_code as string })),
    specs,
  };
}
