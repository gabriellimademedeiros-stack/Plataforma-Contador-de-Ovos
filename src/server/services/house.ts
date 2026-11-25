import "server-only";
import { notFound } from "next/navigation";
import { getSql } from "@/db/client";
import { addDays, ageDays, ageWeeksDecimal, phaseForAgeWeek, PHASE_LABEL, weekLabel } from "@/lib/dates";
import { HOUSE_COLORS, CLASS_COLORS, STRAIN_LINE_COLOR, type StatusColor } from "@/lib/colors";
import { METRIC_BY_CODE } from "@/engine/metrics/catalog";
import { statusFor, targetFor } from "@/engine/standards/targets";
import { mean, median } from "@/engine/stats";
import { assertHouse, type Scope } from "@/server/permissions";
import { currentFlockOf, getFlocks, getHouses, getRefDate, type FlockRef } from "@/server/repositories/reference";
import { getInternalStandards, getStrainStandards, getTargets } from "@/server/repositories/config";
import { alertMarks, eventMarks, listAlerts, listEvents } from "@/server/repositories/marks";
import type { ChartSpec, SeriesSpec } from "@/components/charts/types";
import { readDaily, readWeekly, windowAggregate, type DailyRow } from "./metrics-query";

const NAME = (m: string) => METRIC_BY_CODE[m]?.short ?? m;
const UNIT = (m: string) => METRIC_BY_CODE[m]?.unit ?? "";
const DEC = (m: string) => METRIC_BY_CODE[m]?.decimals ?? 1;

export async function getHouseContext(scope: Scope, code: string) {
  const houses = await getHouses();
  const house = houses.find((h) => h.code === code.toUpperCase());
  if (!house) notFound();
  assertHouse(scope, house.code);
  const [refDate, flocks] = await Promise.all([getRefDate(), getFlocks()]);
  const flock = currentFlockOf(flocks, house.code, refDate) ?? null;
  return { house, flock, refDate, flocks };
}

export type HouseCtx = Awaited<ReturnType<typeof getHouseContext>>;

export async function getHouseHeader(ctx: HouseCtx) {
  const { house, flock, refDate } = ctx;
  const sql = getSql();
  const [rec] = await sql`select birds_start, deaths, culls from app.daily_records where house_id = ${house.id} and date = ${refDate}`;
  const present = rec ? Number(rec.birds_start) - Number(rec.deaths) - Number(rec.culls) : null;
  const aDays = flock ? ageDays(refDate, flock.hatchDate) : null;
  return {
    code: house.code,
    name: house.name,
    color: house.color,
    flock: flock?.code ?? null,
    strain: flock?.strainName ?? null,
    ageDays: aDays,
    phase: aDays != null ? PHASE_LABEL[phaseForAgeWeek(Math.floor(aDays / 7))] : null,
    housed: flock?.birdsHoused ?? null,
    present,
    viability: present != null && flock ? (present / flock.birdsHoused) * 100 : null,
    plannedCull: flock ? addDays(flock.hatchDate, flock.plannedCullAgeWeeks * 7) : null,
    coolingDelta: house.coolingDelta,
  };
}

function seriesOf(rows: DailyRow[], metric: string, house: string, name?: string, extra: Partial<SeriesSpec> = {}): SeriesSpec {
  return { name: name ?? NAME(metric), data: rows.filter((r) => r.metric === metric && r.house === house).map((r) => [r.date, r.value]), ...extra };
}

async function marksFor(ctx: HouseCtx, scope: Scope, from: string, to: string) {
  const [events, alerts] = await Promise.all([
    listEvents({ houses: [ctx.house.code], from, to }),
    listAlerts({ houses: [ctx.house.code], includeFarm: false, from, to, canSeeFinance: scope.canSeeFinance }),
  ]);
  return { events, alerts };
}

/** Painel sincronizado dos últimos 60 dias (tela-chave da demonstração). */
export async function getSyncedPanel(scope: Scope, ctx: HouseCtx, days = 60): Promise<ChartSpec[]> {
  const to = ctx.refDate;
  const from = addDays(to, -(days - 1));
  const rows = await readDaily(scope, { houses: [ctx.house.code], metrics: ["amb.temp_max", "amb.temp_ext_max", "nut.racao", "nut.agua", "prod.postura"], from, to });
  const { events, alerts } = await marksFor(ctx, scope, from, to);
  const ev = eventMarks(events);
  const h = ctx.house.code;
  const yAt = (m: string) => (a: { openedOn: string }) => rows.find((r) => r.metric === m && r.date === a.openedOn)?.value ?? null;
  const metricOfAlert = (a: { metricCode: string | null }) => a.metricCode ?? "";
  const pick = (m: string[]) => alerts.filter((a) => m.includes(metricOfAlert(a)));
  return [
    {
      kind: "timeseries",
      title: "Temperatura máxima interna e externa",
      unit: "°C",
      decimals: 1,
      series: [seriesOf(rows, "amb.temp_max", h, "Interna (máx.)", { color: "#dc2626" }), seriesOf(rows, "amb.temp_ext_max", h, "Externa (máx.)", { color: "#9ca3af", dashed: true })],
      refLines: [{ name: "32 °C", y: 32, color: "#dc2626", dashed: true }],
      events: ev,
      alerts: alertMarks(pick(["amb.temp_max"]), yAt("amb.temp_max")),
      context: { galpao: h, metricas: ["amb.temp_max", "amb.temp_ext_max"], periodo: { inicio: from, fim: to } },
    },
    {
      kind: "timeseries",
      title: "Ração por ave",
      unit: "g/ave/dia",
      decimals: 1,
      series: [seriesOf(rows, "nut.racao", h, "Ração", { color: "#a16207" })],
      events: ev,
      alerts: alertMarks(pick(["nut.racao"]), yAt("nut.racao")),
      context: { galpao: h, metricas: ["nut.racao"], periodo: { inicio: from, fim: to } },
    },
    {
      kind: "timeseries",
      title: "Água por ave",
      unit: "mL/ave/dia",
      decimals: 0,
      series: [seriesOf(rows, "nut.agua", h, "Água", { color: "#0284c7" })],
      events: ev,
      alerts: alertMarks(pick(["nut.agua"]), yAt("nut.agua")),
      context: { galpao: h, metricas: ["nut.agua"], periodo: { inicio: from, fim: to } },
    },
    {
      kind: "timeseries",
      title: "Postura",
      unit: "%",
      decimals: 1,
      series: [seriesOf(rows, "prod.postura", h, "Postura", { color: HOUSE_COLORS[h] })],
      events: ev,
      alerts: alertMarks(pick(["prod.postura", "mort.diaria", "qual.trincados", "qual.razao_pistas", "qual.sujos_fezes", "qual.sujos_sangue"]), yAt("prod.postura")),
      context: { galpao: h, metricas: ["prod.postura"], periodo: { inicio: from, fim: to } },
    },
  ];
}

/** Curva por idade (lote atual, linhagem, faixa do padrão interno, lotes anteriores do mesmo galpão em cinza, eventos do lote). */
export async function getAgeCurve(scope: Scope, ctx: HouseCtx, metric = "prod.postura"): Promise<ChartSpec | null> {
  const { house, flock, flocks } = ctx;
  if (!flock) return null;
  const [strainStd, internal] = await Promise.all([getStrainStandards(), getInternalStandards()]);
  const sameHouse = flocks.filter((f) => f.houseCode === house.code && f.code !== flock.code);
  const weekly = await readWeekly(scope, { houses: [house.code], metrics: [metric], from: "2000-01-01", to: ctx.refDate });
  const flockIdByCode = new Map<string, string>();
  const sql = getSql();
  const ids = await sql`select id, code from app.flocks`;
  for (const r of ids) flockIdByCode.set(r.code, r.id);
  const curOf = (code: string) => weekly.filter((w) => w.flockId === flockIdByCode.get(code) && w.daysCount >= 4).map((w) => [w.ageWeek, w.value] as [number, number | null]);
  const cur = curOf(flock.code);
  const weeks = cur.map((c) => c[0]);
  const minW = Math.min(17, ...weeks);
  const maxW = Math.max(...weeks, 30);
  const range: number[] = [];
  for (let w = minW; w <= Math.min(100, maxW + 4); w++) range.push(w);
  const series: SeriesSpec[] = sameHouse.map((f) => ({ name: `${f.code} (anterior)`, data: curOf(f.code), muted: true }));
  series.push({ name: "Curva da linhagem", data: range.map((w) => [w, strainStd.week(flock.strainCode, metric, w)]), color: STRAIN_LINE_COLOR, dashed: true, width: 1.5 });
  const intMedian: Array<[number, number | null]> = range.map((w) => [w, internal.sufficient(flock.strainCode, metric, w) ? (internal.get(flock.strainCode, metric, w)?.median ?? null) : null]);
  series.push({ name: "Padrão interno (mediana)", data: intMedian, color: "#9ca3af", dotted: true, width: 1.5 });
  series.push({ name: `${flock.code} (atual)`, data: cur, color: HOUSE_COLORS[house.code], width: 2.5 });
  const events = await listEvents({ houses: [house.code], from: flock.startDate, to: ctx.refDate });
  const insufficient = range.every((w) => !internal.sufficient(flock.strainCode, metric, w));
  return {
    kind: "age",
    title: `${NAME(metric)} por semana de idade`,
    subtitle: `${flock.code} · ${flock.strainName}`,
    unit: UNIT(metric),
    decimals: DEC(metric),
    series,
    bands: [
      {
        name: "Padrão interno (25º–75º)",
        lower: range.map((w) => [w, internal.sufficient(flock.strainCode, metric, w) ? (internal.get(flock.strainCode, metric, w)?.p25 ?? null) : null]),
        upper: range.map((w) => [w, internal.sufficient(flock.strainCode, metric, w) ? (internal.get(flock.strainCode, metric, w)?.p75 ?? null) : null]),
      },
    ],
    events: eventMarks(events, "idade", (d) => Math.round(ageWeeksDecimal(d, flock.hatchDate) * 10) / 10),
    warnings: insufficient ? ["padrão interno insuficiente; usando a curva da linhagem"] : undefined,
    context: { galpao: house.code, lote: flock.code, metrica: metric, eixo: "idade" },
    yMin: metric === "prod.postura" ? 60 : undefined,
  };
}

export interface WeeklyTableRow {
  weekStart: string;
  label: string;
  ageWeek: number;
  partial: boolean;
  cells: Record<string, { value: number | null; status: StatusColor }>;
}

export const WEEKLY_COLUMNS: Array<{ key: string; label: string; decimals: number; finance?: boolean }> = [
  { key: "prod.postura", label: "Postura (%)", decimals: 1 },
  { key: "prod.desvio_interno", label: "Desvio (p.p.)", decimals: 1 },
  { key: "prod.oaa", label: "Ovo/ave alojada", decimals: 1 },
  { key: "mort.diaria", label: "Mort. semana (%)", decimals: 2 },
  { key: "mort.acumulada", label: "Mort. acum. (%)", decimals: 2 },
  { key: "qual.trincados", label: "Trincados (%)", decimals: 2 },
  { key: "qual.quebrados", label: "Quebrados (%)", decimals: 2 },
  { key: "qual.sujos_fezes", label: "Sujos fezes (%)", decimals: 2 },
  { key: "qual.sujos_sangue", label: "Sangue (%)", decimals: 2 },
  { key: "nut.racao", label: "Ração (g/ave)", decimals: 1 },
  { key: "nut.agua", label: "Água (mL/ave)", decimals: 0 },
  { key: "nut.conv_dz", label: "Conv. (kg/dz)", decimals: 3 },
  { key: "fin.margem", label: "Margem (R$)", decimals: 0, finance: true },
];

/** Tabela semanal no formato da Análise Semanal (últimas 12 semanas). */
export async function getWeeklyTable(scope: Scope, ctx: HouseCtx, weeks = 12): Promise<{ columns: typeof WEEKLY_COLUMNS; rows: WeeklyTableRow[] }> {
  const cols = WEEKLY_COLUMNS.filter((c) => !c.finance || scope.canSeeFinance);
  const from = addDays(ctx.refDate, -7 * weeks);
  const [rows, targets] = await Promise.all([readWeekly(scope, { houses: [ctx.house.code], metrics: cols.map((c) => c.key), from, to: ctx.refDate }), getTargets()]);
  const byWeek = new Map<string, typeof rows>();
  for (const r of rows) {
    if (ctx.flock && r.flockId !== ctx.flock.id) continue;
    let a = byWeek.get(r.weekStart);
    if (!a) byWeek.set(r.weekStart, (a = []));
    a.push(r);
  }
  const out: WeeklyTableRow[] = [...byWeek.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([ws, list]) => ({
      weekStart: ws,
      label: weekLabel(ws).replace("Semana de ", ""),
      ageWeek: list[0]?.ageWeek ?? 0,
      partial: (list[0]?.daysCount ?? 7) < 7,
      cells: Object.fromEntries(
        cols.map((c) => {
          const v = list.find((x) => x.metric === c.key)?.value ?? null;
          const tKey = c.key === "fin.margem" ? null : c.key;
          return [c.key, { value: v, status: tKey ? statusFor(v, targetFor(targets, tKey)) : "cinza" }];
        }),
      ),
    }));
  return { columns: cols, rows: out };
}

/** Cartões com minigráficos de cada indicador do galpão (últimos 30 dias). */
export async function getHouseMiniCards(scope: Scope, ctx: HouseCtx) {
  const metrics = ["prod.postura", "prod.desvio_interno", "prod.aproveitamento", "qual.trincados", "qual.sujos_fezes", "qual.sujos_sangue", "mort.diaria", "nut.racao", "nut.agua", "amb.temp_max", "prod.peso_ovo", ...(scope.canSeeFinance ? ["fin.margem_dz"] : [])];
  const from = addDays(ctx.refDate, -29);
  const [rows, targets] = await Promise.all([readDaily(scope, { houses: [ctx.house.code], metrics, from, to: ctx.refDate }), getTargets()]);
  return metrics.map((m) => {
    const series = rows.filter((r) => r.metric === m).map((r) => ({ date: r.date, value: r.value }));
    const last = windowAggregate(rows, m, ctx.refDate, ctx.refDate, [ctx.house.code]).byHouse.get(ctx.house.code)?.value ?? null;
    const avg7 = windowAggregate(rows, m, addDays(ctx.refDate, -6), ctx.refDate, [ctx.house.code]).byHouse.get(ctx.house.code)?.value ?? null;
    return { metric: m, name: NAME(m), unit: UNIT(m), decimals: DEC(m), last, avg7, status: statusFor(m === "mort.diaria" ? avg7 : last, targetFor(targets, m)), series };
  });
}

export async function getHouseAlerts(scope: Scope, ctx: HouseCtx) {
  const from = ctx.flock?.startDate ?? addDays(ctx.refDate, -365);
  return listAlerts({ houses: [ctx.house.code], includeFarm: false, from, to: ctx.refDate, canSeeFinance: scope.canSeeFinance, limit: 100 });
}

export async function getHouseNotes(ctx: HouseCtx) {
  const sql = getSql();
  const rows = await sql`select n.id, n.text, n.created_at, u.name from app.house_notes n left join app.users u on u.id = n.user_id where n.house_id = ${ctx.house.id} order by n.created_at desc limit 50`;
  return rows.map((r) => ({ id: r.id as string, text: r.text as string, createdAt: new Date(r.created_at).toISOString(), author: (r.name as string) ?? "—" }));
}

// ---------------------------------------------------------------------------------------------
// Abas temáticas
// ---------------------------------------------------------------------------------------------

export async function getHouseProduction(scope: Scope, ctx: HouseCtx, days: number) {
  const to = ctx.refDate;
  const from = addDays(to, -(days - 1));
  const h = ctx.house.code;
  const rows = await readDaily(scope, { houses: [h], metrics: ["prod.postura", "prod.ovos", "prod.caixas", "prod.oaa", "prod.peso_ovo", "prod.massa"], from, to });
  const weekly = await readWeekly(scope, { houses: [h], metrics: ["prod.postura"], from, to });
  const { events } = await marksFor(ctx, scope, from, to);
  const ev = eventMarks(events);
  const strainStd = await getStrainStandards();
  const f = ctx.flock;
  const stdSeries = (m: string): SeriesSpec => ({
    name: "Curva da linhagem",
    data: rows.filter((r) => r.metric === m).map((r) => [r.date, f ? strainStd.at(f.strainCode, m, ageWeeksDecimal(r.date, f.hatchDate)) : null]),
    color: STRAIN_LINE_COLOR,
    dashed: true,
    width: 1.5,
  });
  // horário de postura (últimos 30 dias)
  const sql = getSql();
  const hourly = await sql`select date, extract(hour from window_start at time zone 'America/Fortaleza')::int as hour, sum(qty)::int as qty
    from app.egg_counts where house_id = ${ctx.house.id} and window_minutes = 60 and date > ${addDays(to, -30)} group by date, hour order by date, hour`;
  const dates = Array.from(new Set(hourly.map((r) => (r.date as Date).toISOString?.().slice(0, 10) ?? String(r.date).slice(0, 10))));
  const hours = Array.from({ length: 11 }, (_, i) => i + 6);
  const heat: ChartSpec = {
    kind: "heatmap",
    title: "Horário de postura (ovos por hora, últimos 30 dias)",
    unit: "ovos",
    decimals: 0,
    series: [],
    heat: {
      x: dates,
      y: hours.map((x) => `${String(x).padStart(2, "0")}h`),
      values: hourly.map((r) => [dates.indexOf((r.date as Date).toISOString?.().slice(0, 10) ?? String(r.date).slice(0, 10)), hours.indexOf(Number(r.hour)), Number(r.qty)] as [number, number, number]),
      colors: ["#f8fafc", "#bfdbfe", "#3b82f6", "#1e3a8a"],
    },
    height: 300,
  };
  return {
    posture: { kind: "timeseries", title: "Postura diária e semanal", unit: "%", decimals: 1, series: [seriesOf(rows, "prod.postura", h, "Diária", { color: HOUSE_COLORS[h] }), { name: "Semanal", data: weekly.map((w) => [addDays(w.weekStart, 3), w.value]), color: "#111827", step: true, width: 1.5 }, stdSeries("prod.postura")], events: ev, context: { galpao: h, metrica: "prod.postura" } } satisfies ChartSpec,
    eggs: { kind: "timeseries", title: "Ovos e caixas por dia", unit: "ovos", unit2: "cx", decimals: 0, series: [seriesOf(rows, "prod.ovos", h, "Ovos", { type: "bar", color: "#93c5fd" }), seriesOf(rows, "prod.caixas", h, "Caixas", { yAxis: 1, color: "#1e3a8a" })], events: ev } satisfies ChartSpec,
    oaa: { kind: "timeseries", title: "Ovo por ave alojada × curva", unit: "ovos/ave", decimals: 1, series: [seriesOf(rows, "prod.oaa", h, "Real", { color: HOUSE_COLORS[h] }), stdSeries("prod.oaa")] } satisfies ChartSpec,
    weight: { kind: "timeseries", title: "Peso do ovo e massa × curva", unit: "g", unit2: "g/ave/dia", decimals: 1, series: [seriesOf(rows, "prod.peso_ovo", h, "Peso do ovo", { color: "#7c3aed" }), { ...stdSeries("prod.peso_ovo"), name: "Peso (curva)" }, seriesOf(rows, "prod.massa", h, "Massa", { yAxis: 1, color: "#0d9488" })], events: ev } satisfies ChartSpec,
    laying: heat,
  };
}

export async function getHouseQuality(scope: Scope, ctx: HouseCtx, days: number) {
  const to = ctx.refDate;
  const from = addDays(to, -(days - 1));
  const h = ctx.house.code;
  const metrics = ["qual.trincados", "qual.quebrados", "qual.sujos_fezes", "qual.sujos_sangue", "qual.indeterminados", "qual.trincados_pista1", "qual.trincados_pista2", "qual.avarias_pista1", "qual.avarias_pista2", "qual.sujos_fezes_pista1", "qual.sujos_fezes_pista2", "qual.razao_pistas", "qual.perda_brl"];
  const rows = await readDaily(scope, { houses: [h], metrics: scope.canSeeFinance ? metrics : metrics.filter((m) => m !== "qual.perda_brl"), from, to });
  const { events, alerts } = await marksFor(ctx, scope, from, to);
  const ev = eventMarks(events);
  const agg = (m: string) => windowAggregate(rows, m, from, to, [h]).byHouse.get(h)?.value ?? null;
  const sql = getSql();
  const [cnt] = await sql`select coalesce(sum(qty) filter (where egg_class='cracked'),0)::int as cracked, coalesce(sum(qty) filter (where egg_class='broken'),0)::int as broken,
    coalesce(sum(qty) filter (where egg_class='dirty_feces'),0)::int as feces, coalesce(sum(qty) filter (where egg_class='dirty_blood'),0)::int as blood,
    coalesce(sum(qty) filter (where egg_class='undetermined'),0)::int as undet
    from app.egg_counts where house_id = ${ctx.house.id} and window_minutes = 1440 and date between ${from} and ${to}`;
  const loss = scope.canSeeFinance ? windowAggregate(rows, "qual.perda_brl", from, to, [h]).byHouse.get(h)?.value ?? null : null;
  return {
    classes: {
      kind: "timeseries",
      title: "Percentual de cada classe por dia",
      unit: "%",
      decimals: 2,
      series: [
        seriesOf(rows, "qual.trincados", h, "Trincados", { color: CLASS_COLORS.cracked }),
        seriesOf(rows, "qual.quebrados", h, "Quebrados", { color: CLASS_COLORS.broken }),
        seriesOf(rows, "qual.sujos_fezes", h, "Sujos de fezes", { color: CLASS_COLORS.dirty_feces }),
        seriesOf(rows, "qual.sujos_sangue", h, "Sujos de sangue", { color: CLASS_COLORS.dirty_blood }),
        seriesOf(rows, "qual.indeterminados", h, "Indeterminados", { color: CLASS_COLORS.undetermined }),
      ],
      events: ev,
      alerts: alertMarks(alerts.filter((a) => (a.metricCode ?? "").startsWith("qual.")), (a) => rows.find((r) => r.metric === "qual.trincados" && r.date === a.openedOn)?.value ?? null),
      context: { galpao: h, metricas: ["qual.trincados", "qual.sujos_fezes", "qual.sujos_sangue"] },
    } satisfies ChartSpec,
    lanes: {
      kind: "timeseries",
      title: "Trincados por pista",
      unit: "%",
      decimals: 2,
      series: [seriesOf(rows, "qual.trincados_pista1", h, "Pista 1", { color: "#2563eb" }), seriesOf(rows, "qual.trincados_pista2", h, "Pista 2", { color: "#ea580c" })],
      events: ev,
      context: { galpao: h, metricas: ["qual.trincados_pista1", "qual.trincados_pista2"] },
    } satisfies ChartSpec,
    lanesDirty: {
      kind: "timeseries",
      title: "Sujos de fezes por pista",
      unit: "%",
      decimals: 2,
      series: [seriesOf(rows, "qual.sujos_fezes_pista1", h, "Pista 1", { color: "#2563eb" }), seriesOf(rows, "qual.sujos_fezes_pista2", h, "Pista 2", { color: "#ea580c" })],
      events: ev,
    } satisfies ChartSpec,
    pareto: { kind: "pareto", title: "Pareto de defeitos (ovos no período)", unit: "ovos", decimals: 0, series: [{ name: "Ovos", data: [["Trincados", Number(cnt.cracked)], ["Sujos de fezes", Number(cnt.feces)], ["Indeterminados", Number(cnt.undet)], ["Quebrados", Number(cnt.broken)], ["Sujos de sangue", Number(cnt.blood)]] }] } satisfies ChartSpec,
    laneTable: [
      { label: "Avarias (%)", p1: agg("qual.avarias_pista1"), p2: agg("qual.avarias_pista2") },
      { label: "Trincados (%)", p1: agg("qual.trincados_pista1"), p2: agg("qual.trincados_pista2") },
      { label: "Sujos de fezes (%)", p1: agg("qual.sujos_fezes_pista1"), p2: agg("qual.sujos_fezes_pista2") },
    ],
    loss,
    period: { from, to },
  };
}

export async function getHouseHealth(scope: Scope, ctx: HouseCtx, days: number) {
  const to = ctx.refDate;
  const from = addDays(to, -(days - 1));
  const h = ctx.house.code;
  const rows = await readDaily(scope, { houses: [h], metrics: ["mort.diaria", "mort.acumulada", "mort.mortes"], from: addDays(from, -14), to });
  const strainStd = await getStrainStandards();
  const f = ctx.flock;
  const mort = rows.filter((r) => r.metric === "mort.diaria");
  const ma7 = mort.map((r, i) => [r.date, mean(mort.slice(Math.max(0, i - 6), i + 1).map((x) => x.value))] as [string, number | null]);
  const med14 = mort.map((r, i) => [r.date, median(mort.slice(Math.max(0, i - 14), i).map((x) => x.value))] as [string, number | null]);
  const inRange = (d: string) => d >= from;
  const { events, alerts } = await marksFor(ctx, scope, from, to);
  const sanitary = events.filter((e) => e.category === "sanitario");
  // mortes por causa, por semana
  const sql = getSql();
  const causes = await sql`select date_trunc('week', date + 1)::date - 1 as ws, key as cause, sum(value::int)::int as n
    from app.daily_records, jsonb_each_text(deaths_by_cause) where house_id = ${ctx.house.id} and date between ${from} and ${to} group by ws, key order by ws`;
  const causeNames: Record<string, string> = { desconhecida: "Desconhecida", refugo: "Refugo", prolapso: "Prolapso", calor: "Calor", outras: "Outras", doenca_respiratoria: "Doença respiratória" };
  const weeksSet = Array.from(new Set(causes.map((c) => String((c.ws as Date).toISOString?.() ?? c.ws).slice(0, 10))));
  const causeKeys = Array.from(new Set(causes.map((c) => c.cause as string)));
  return {
    daily: {
      kind: "timeseries",
      title: "Mortalidade diária, média móvel de 7 dias e mediana de 14 dias",
      unit: "%",
      decimals: 3,
      series: [
        { name: "Diária", data: mort.filter((r) => inRange(r.date)).map((r) => [r.date, r.value]), type: "bar", color: "#fca5a5" },
        { name: "Média móvel 7 dias", data: ma7.filter((d) => inRange(d[0])), color: "#dc2626" },
        { name: "Mediana 14 dias", data: med14.filter((d) => inRange(d[0])), color: "#6b7280", dashed: true },
      ],
      events: eventMarks(events),
      alerts: alertMarks(alerts.filter((a) => a.metricCode === "mort.diaria"), (a) => mort.find((r) => r.date === a.openedOn)?.value ?? null),
      context: { galpao: h, metrica: "mort.diaria" },
    } satisfies ChartSpec,
    cumulative: {
      kind: "timeseries",
      title: "Mortalidade acumulada × curva da linhagem",
      unit: "%",
      decimals: 2,
      series: [
        { name: "Acumulada", data: rows.filter((r) => r.metric === "mort.acumulada" && inRange(r.date)).map((r) => [r.date, r.value]), color: HOUSE_COLORS[h] },
        { name: "Curva da linhagem", data: rows.filter((r) => r.metric === "mort.acumulada" && inRange(r.date)).map((r) => [r.date, f ? strainStd.at(f.strainCode, "mort.acumulada", ageWeeksDecimal(r.date, f.hatchDate)) : null]), color: STRAIN_LINE_COLOR, dashed: true },
      ],
    } satisfies ChartSpec,
    causes: {
      kind: "bar",
      title: "Mortes por causa (por semana)",
      unit: "aves",
      decimals: 0,
      categories: weeksSet.map((w) => `${w.slice(8, 10)}/${w.slice(5, 7)}`),
      series: causeKeys.map((k) => ({
        name: causeNames[k] ?? k,
        stack: "c",
        type: "bar" as const,
        data: weeksSet.map((w) => [`${w.slice(8, 10)}/${w.slice(5, 7)}`, Number(causes.find((c) => String((c.ws as Date).toISOString?.() ?? c.ws).slice(0, 10) === w && c.cause === k)?.n ?? 0)] as [string, number]),
      })),
    } satisfies ChartSpec,
    sanitary,
    vaccines: sanitary.filter((e) => e.typeCode === "sanitario.vacinacao"),
  };
}

export async function getHouseNutrition(scope: Scope, ctx: HouseCtx, days: number) {
  const to = ctx.refDate;
  const from = addDays(to, -(days - 1));
  const h = ctx.house.code;
  const rows = await readDaily(scope, { houses: [h], metrics: ["nut.racao", "nut.agua", "nut.agua_racao", "nut.conv_dz", "nut.conv_massa", "nut.peso_corporal", "nut.uniformidade"], from, to });
  const strainStd = await getStrainStandards();
  const f = ctx.flock;
  const std = (m: string, name = "Padrão da linhagem"): SeriesSpec => ({ name, data: rows.filter((r) => r.metric === m).map((r) => [r.date, f ? strainStd.at(f.strainCode, m, ageWeeksDecimal(r.date, f.hatchDate)) : null]), color: STRAIN_LINE_COLOR, dashed: true });
  const { events } = await marksFor(ctx, scope, from, to);
  const ev = eventMarks(events);
  const sql = getSql();
  const batches = await sql`select b.code, b.delivered_on, b.formulation, b.price_per_kg, b.calcium_pct_spec,
      (select array_agg(h2.code order by h2.code) from app.houses h2 where h2.id = any(b.house_ids)) as houses
    from app.feed_batches b where ${ctx.house.id} = any(b.house_ids) and b.delivered_on between ${addDays(from, -30)} and ${to} order by b.delivered_on desc`;
  const sw = await sql`select date, mean_g, uniformity_pct from app.body_weight_samples where house_id = ${ctx.house.id} and date between ${from} and ${to} order by date`;
  return {
    feed: { kind: "timeseries", title: "Ração por ave × padrão", unit: "g/ave/dia", decimals: 1, series: [seriesOf(rows, "nut.racao", h, "Ração", { color: "#a16207" }), std("nut.racao")], events: ev } satisfies ChartSpec,
    water: { kind: "timeseries", title: "Água por ave × padrão (conforto térmico)", unit: "mL/ave/dia", decimals: 0, series: [seriesOf(rows, "nut.agua", h, "Água", { color: "#0284c7" }), std("nut.agua")], events: ev } satisfies ChartSpec,
    ratio: { kind: "timeseries", title: "Relação água:ração", unit: "mL/g", decimals: 2, series: [seriesOf(rows, "nut.agua_racao", h, "Água:ração", { color: "#0891b2" })], events: ev } satisfies ChartSpec,
    conversion: { kind: "timeseries", title: "Conversão alimentar", unit: "kg/dz", unit2: "kg/kg", decimals: 3, series: [seriesOf(rows, "nut.conv_dz", h, "Por dúzia", { color: "#4b5563" }), seriesOf(rows, "nut.conv_massa", h, "Por massa", { yAxis: 1, color: "#0d9488" })] } satisfies ChartSpec,
    body: {
      kind: "timeseries",
      title: "Peso corporal e uniformidade × curva (pesagem semanal)",
      unit: "g",
      unit2: "%",
      decimals: 0,
      series: [
        { name: "Peso corporal", data: sw.map((r) => [String((r.date as Date).toISOString?.() ?? r.date).slice(0, 10), Number(r.mean_g)]), color: "#7c3aed", symbol: true },
        { name: "Curva da linhagem", data: sw.map((r) => { const d = String((r.date as Date).toISOString?.() ?? r.date).slice(0, 10); return [d, f ? strainStd.at(f.strainCode, "nut.peso_corporal", ageWeeksDecimal(d, f.hatchDate)) : null]; }), color: STRAIN_LINE_COLOR, dashed: true },
        { name: "Uniformidade", data: sw.map((r) => [String((r.date as Date).toISOString?.() ?? r.date).slice(0, 10), Number(r.uniformity_pct)]), yAxis: 1, color: "#16a34a", symbol: true },
      ],
    } satisfies ChartSpec,
    batches: batches.map((b) => ({ code: b.code as string, deliveredOn: String((b.delivered_on as Date).toISOString?.() ?? b.delivered_on).slice(0, 10), formulation: b.formulation as string, price: Number(b.price_per_kg), calcium: Number(b.calcium_pct_spec), houses: (b.houses as string[]) ?? [] })),
  };
}

export async function getHouseAmbience(scope: Scope, ctx: HouseCtx) {
  const to = ctx.refDate;
  const from = addDays(to, -59);
  const h = ctx.house.code;
  const sql = getSql();
  const hourly = await sql`select ts, metric_code, value, house_id from app.sensor_readings
    where (house_id = ${ctx.house.id} or house_id is null) and metric_code in ('amb.temp_interna','amb.temp_externa','amb.umidade','amb.nh3')
    and ts >= (${from}::date + interval '6 hours') at time zone 'America/Fortaleza' order by ts`;
  const pts = (m: string, ext = false) => hourly.filter((r) => r.metric_code === m && (ext ? r.house_id == null : r.house_id != null)).map((r) => [new Date(r.ts).toISOString(), Number(r.value)] as [string, number]);
  const rows = await readDaily(scope, { houses: [h], metrics: ["amb.horas_30", "amb.horas_32", "amb.graus_hora_30", "amb.umidade", "amb.nh3_max", "amb.delta_resfriamento", "amb.temp_max"], from, to });
  const farmDelta = await readDaily(scope, { metrics: ["amb.delta_resfriamento"], from, to });
  const medByDate = new Map<string, number | null>();
  for (const d of Array.from(new Set(farmDelta.map((r) => r.date)))) medByDate.set(d, median(farmDelta.filter((r) => r.date === d).map((r) => r.value)));
  const { events } = await marksFor(ctx, scope, from, to);
  const ev = eventMarks(events);
  // mapa hora × dia da temperatura interna
  const tin = hourly.filter((r) => r.metric_code === "amb.temp_interna" && r.house_id != null);
  const fmtLocal = (ts: Date) => {
    const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(ts);
    const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
    return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
  };
  const cells = tin.map((r) => ({ ...fmtLocal(new Date(r.ts)), v: Number(r.value) }));
  const dates = Array.from(new Set(cells.map((c) => c.date))).sort();
  return {
    hourly: {
      kind: "timeseries",
      title: "Temperatura interna e externa por hora (últimos 60 dias)",
      unit: "°C",
      decimals: 1,
      series: [{ name: "Interna", data: pts("amb.temp_interna"), color: "#dc2626", width: 1 }, { name: "Externa", data: pts("amb.temp_externa", true), color: "#9ca3af", dashed: true, width: 1 }],
      refLines: [{ name: "30 °C", y: 30, color: "#d97706", dashed: true }, { name: "32 °C", y: 32, color: "#dc2626", dashed: true }],
      events: ev,
      context: { galpao: h, metrica: "amb.temp_interna", granularidade: "hora" },
    } satisfies ChartSpec,
    heat: {
      kind: "heatmap",
      title: "Temperatura interna: hora × dia",
      unit: "°C",
      decimals: 1,
      series: [],
      heat: { x: dates, y: Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}h`), values: cells.map((c) => [dates.indexOf(c.date), c.hour, c.v] as [number, number, number]), min: 20, max: 36, colors: ["#dbeafe", "#fef9c3", "#fb923c", "#b91c1c"] },
      height: 420,
    } satisfies ChartSpec,
    hours: { kind: "timeseries", title: "Horas e graus-hora acima do limite por dia", unit: "h", unit2: "°C·h", decimals: 0, series: [seriesOf(rows, "amb.horas_30", h, "Horas > 30 °C", { type: "bar", color: "#fdba74" }), seriesOf(rows, "amb.horas_32", h, "Horas > 32 °C", { type: "bar", color: "#dc2626" }), seriesOf(rows, "amb.graus_hora_30", h, "Graus-hora > 30 °C", { yAxis: 1, color: "#7c2d12" })], events: ev } satisfies ChartSpec,
    humidity: { kind: "timeseries", title: "Umidade relativa média e amônia máxima", unit: "%", unit2: "ppm", decimals: 0, series: [seriesOf(rows, "amb.umidade", h, "Umidade", { color: "#0284c7" }), seriesOf(rows, "amb.nh3_max", h, "Amônia máx.", { yAxis: 1, color: "#65a30d" })] } satisfies ChartSpec,
    cooling: {
      kind: "timeseries",
      title: "Diferença de resfriamento (externa máx. − interna máx.) × mediana da granja",
      unit: "°C",
      decimals: 1,
      series: [seriesOf(rows, "amb.delta_resfriamento", h, h, { color: HOUSE_COLORS[h] }), { name: "Mediana da granja", data: [...medByDate.entries()].sort().map(([d, v]) => [d, v]), color: "#6b7280", dashed: true }],
    } satisfies ChartSpec,
  };
}

export async function getHouseDevices(ctx: HouseCtx) {
  const sql = getSql();
  const rows = await sql`select d.*, (select sum(qty) filter (where egg_class='undetermined')::float / nullif(sum(qty),0) * 100 from app.egg_counts e where e.house_id = ${ctx.house.id} and e.date = ${ctx.refDate} and e.window_minutes = 1440) as undet
    from app.devices d join app.device_assignments a on a.device_id = d.id and a.valid_to is null where a.house_id = ${ctx.house.id} order by d.type desc`;
  const [last] = await sql`select max(window_start) as ws from app.egg_counts where house_id = ${ctx.house.id}`;
  return rows.map((r) => ({
    code: r.code as string,
    type: r.type as string,
    // situação ao vivo: online até 2 minutos depois da última mensagem; depois, offline
    status: r.last_seen_at ? (Date.now() - new Date(r.last_seen_at).getTime() <= 120_000 ? "online" : "offline") : (r.status as string),
    model: r.model_version as string | null,
    firmware: r.firmware as string | null,
    confidence: r.confidence_score == null ? null : Number(r.confidence_score),
    lastSeen: r.last_seen_at ? new Date(r.last_seen_at).toISOString() : last?.ws ? new Date(last.ws).toISOString() : null,
    undetermined: r.undet == null ? null : Number(r.undet),
  }));
}

export type { FlockRef };
