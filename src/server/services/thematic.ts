import "server-only";
import { getSql } from "@/db/client";
import { addDays, ageWeeksDecimal, lastCompleteWeekStart, weekLabel } from "@/lib/dates";
import { CLASS_COLORS, HOUSE_COLORS, STRAIN_LINE_COLOR, type StatusColor } from "@/lib/colors";
import { METRIC_BY_CODE } from "@/engine/metrics/catalog";
import { statusFor, targetFor } from "@/engine/standards/targets";
import { relativeDeviation, statusForRelativeDeviation } from "@/engine/metrics/derived";
import { mean } from "@/engine/stats";
import type { Scope } from "@/server/permissions";
import { currentFlockOf, getFlocks, getHouses, getRefDate } from "@/server/repositories/reference";
import { getStrainStandards, getTargets } from "@/server/repositories/config";
import { eventMarks, listEvents } from "@/server/repositories/marks";
import type { ChartSpec, SeriesSpec } from "@/components/charts/types";
import { farmSeries, readDaily, readWeekly, scopedHouseCodes, windowAggregate, type DailyRow } from "./metrics-query";

const NAME = (m: string) => METRIC_BY_CODE[m]?.short ?? m;
const d10 = (v: unknown) => (typeof v === "string" ? v.slice(0, 10) : (v as Date).toISOString().slice(0, 10));

function houseLines(rows: DailyRow[], metric: string, houses: string[]): SeriesSpec[] {
  return houses.map((h) => ({ name: h, color: HOUSE_COLORS[h], width: 1.5, data: rows.filter((r) => r.metric === metric && r.house === h).map((r) => [r.date, r.value]) }));
}

async function base(scope: Scope, days: number) {
  const refDate = await getRefDate();
  const houses = await scopedHouseCodes(scope);
  return { refDate, houses, from: addDays(refDate, -(days - 1)), to: refDate };
}

export async function getProductionPage(scope: Scope, days: number) {
  const { refDate, houses, from, to } = await base(scope, days);
  const metrics = ["prod.ovos", "prod.caixas", "prod.postura", "prod.desvio_interno", "prod.desvio_linhagem", "prod.oaa", "prod.massa", "prod.peso_ovo"];
  const rows = await readDaily(scope, { metrics, from: addDays(refDate, -6) < from ? addDays(refDate, -6) : from, to });
  const ws = lastCompleteWeekStart(refDate);
  const weekly = await readWeekly(scope, { metrics, from: ws, to: ws });
  const table = houses.map((h) => {
    const d = (m: string) => windowAggregate(rows, m, refDate, refDate, [h]).byHouse.get(h)?.value ?? null;
    const w = (m: string) => weekly.find((x) => x.house === h && x.metric === m)?.value ?? null;
    return { house: h, day: Object.fromEntries(metrics.map((m) => [m, d(m)])), week: Object.fromEntries(metrics.map((m) => [m, w(m)])) };
  });
  const totDay = Object.fromEntries(metrics.map((m) => [m, windowAggregate(rows, m, refDate, refDate).total.value]));
  // curvas por idade de todos os lotes ativos
  const flocks = await getFlocks();
  const strainStd = await getStrainStandards();
  const allWeekly = await readWeekly(scope, { metrics: ["prod.postura"], from: "2000-01-01", to: refDate });
  const series: SeriesSpec[] = [];
  const strains = new Set<string>();
  for (const h of houses) {
    const f = currentFlockOf(flocks, h, refDate);
    if (!f) continue;
    strains.add(f.strainCode);
    series.push({ name: `${h} · ${f.code}`, color: HOUSE_COLORS[h], data: allWeekly.filter((x) => x.flockId === f.id && x.daysCount >= 4).map((x) => [x.ageWeek, x.value]) });
  }
  for (const s of strains) {
    const pts: Array<[number, number | null]> = [];
    for (let w = 17; w <= 90; w++) pts.push([w, strainStd.week(s, "prod.postura", w)]);
    series.push({ name: `Curva ${s}`, data: pts, color: STRAIN_LINE_COLOR, dashed: true, width: 1, muted: false });
  }
  return {
    refDate,
    weekLabel: weekLabel(ws),
    table,
    totDay,
    farm: { kind: "timeseries", title: "Postura da granja e por galpão", unit: "%", decimals: 1, series: [...houseLines(rows.filter((r) => r.date >= from), "prod.postura", houses), { name: "Granja", data: farmSeries(rows, "prod.postura", from, to).map((p) => [p.date, p.value]), color: "#111827", width: 3 }], context: { metrica: "prod.postura", galpoes: houses } } satisfies ChartSpec,
    ageCurves: { kind: "age", title: "Curvas de postura por idade — lotes ativos", unit: "%", decimals: 1, xLabel: "Semana de idade", series, yMin: 50 } satisfies ChartSpec,
  };
}

export async function getQualityPage(scope: Scope, days: number, defect: string) {
  const { houses, from, to } = await base(scope, days);
  const metrics = ["qual.trincados", "qual.quebrados", "qual.sujos_fezes", "qual.sujos_sangue", "qual.indeterminados", "qual.avarias_pista1", "qual.avarias_pista2", "qual.trincados_pista1", "qual.trincados_pista2", ...(scope.canSeeFinance ? ["qual.perda_brl"] : [])];
  const rows = await readDaily(scope, { metrics, from, to });
  const targets = await getTargets();
  const classMetrics: Array<[string, string, string]> = [
    ["qual.trincados", "Trincados", CLASS_COLORS.cracked],
    ["qual.quebrados", "Quebrados", CLASS_COLORS.broken],
    ["qual.sujos_fezes", "Sujos de fezes", CLASS_COLORS.dirty_feces],
    ["qual.sujos_sangue", "Sujos de sangue", CLASS_COLORS.dirty_blood],
    ["qual.indeterminados", "Indeterminados", CLASS_COLORS.undetermined],
  ];
  const perHouse: ChartSpec = {
    kind: "bar",
    title: "Percentual por classe por galpão (período)",
    unit: "%",
    decimals: 2,
    categories: houses,
    series: classMetrics.map(([m, n, c]) => ({ name: n, color: c, type: "bar", data: houses.map((h) => [h, windowAggregate(rows, m, from, to, [h]).byHouse.get(h)?.value ?? null] as [string, number | null]) })),
  };
  const trend: ChartSpec = { kind: "timeseries", title: "Tendência diária de cada defeito (granja)", unit: "%", decimals: 2, series: classMetrics.map(([m, n, c]) => ({ name: n, color: c, data: farmSeries(rows, m, from, to).map((p) => [p.date, p.value]) })) };
  const dates: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) dates.push(d);
  const def = classMetrics.find((c) => c[0] === defect) ?? classMetrics[0];
  const heat: ChartSpec = {
    kind: "heatmap",
    title: `${def[1]} — galpão × dia`,
    unit: "%",
    decimals: 2,
    series: [],
    heat: { x: dates, y: houses, values: rows.filter((r) => r.metric === def[0]).map((r) => [dates.indexOf(r.date), houses.indexOf(r.house), r.value] as [number, number, number | null]) },
    height: 60 + houses.length * 34,
  };
  const sql = getSql();
  const ids = (await getHouses()).filter((h) => houses.includes(h.code)).map((h) => h.id);
  const [cnt] = await sql`select coalesce(sum(qty) filter (where egg_class='cracked'),0)::int as cracked, coalesce(sum(qty) filter (where egg_class='broken'),0)::int as broken,
    coalesce(sum(qty) filter (where egg_class='dirty_feces'),0)::int as feces, coalesce(sum(qty) filter (where egg_class='dirty_blood'),0)::int as blood,
    coalesce(sum(qty) filter (where egg_class='undetermined'),0)::int as undet
    from app.egg_counts where house_id in ${sql(ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])} and window_minutes = 1440 and date between ${from} and ${to}`;
  const pareto: ChartSpec = { kind: "pareto", title: "Pareto de defeitos da granja (ovos)", unit: "ovos", decimals: 0, series: [{ name: "Ovos", data: [["Trincados", cnt.cracked], ["Sujos de fezes", cnt.feces], ["Indeterminados", cnt.undet], ["Quebrados", cnt.broken], ["Sujos de sangue", cnt.blood]] }] };
  const lanes = houses.map((h) => {
    const g = (m: string) => windowAggregate(rows, m, from, to, [h]).byHouse.get(h)?.value ?? null;
    const p1 = g("qual.avarias_pista1");
    const p2 = g("qual.avarias_pista2");
    return { house: h, p1, p2, ratio: p1 && p2 ? Math.max(p1, p2) / Math.min(p1, p2) : null, t1: g("qual.trincados_pista1"), t2: g("qual.trincados_pista2") };
  });
  // perda financeira por defeito (Estimado) — preços da semana
  let loss: Array<{ label: string; value: number }> | null = null;
  if (scope.canSeeFinance) {
    const p = await sql`select item, avg(value_brl) as v from app.prices where week_start between ${addDays(from, -6)} and ${to} group by item`;
    const price = (k: string) => Number(p.find((x) => x.item === k)?.v ?? 0);
    const com = price("ovo_comercial_dz");
    loss = [
      { label: "Trincados", value: ((com - price("ovo_trincado_dz")) * cnt.cracked) / 12 },
      { label: "Sujos de fezes", value: ((com - price("ovo_sujo_dz")) * cnt.feces) / 12 },
      { label: "Sujos de sangue", value: ((com - price("ovo_sujo_dz")) * cnt.blood) / 12 },
      { label: "Quebrados", value: (com * cnt.broken) / 12 },
    ];
  }
  const status = (m: string, v: number | null): StatusColor => statusFor(v, targetFor(targets, m));
  return { from, to, houses, perHouse, trend, heat, pareto, lanes, loss, defect: def[0], classMetrics: classMetrics.map((c) => ({ key: c[0], label: c[1] })), status };
}

export async function getHealthPage(scope: Scope, days: number) {
  const { refDate, houses, from, to } = await base(scope, days);
  const rows = await readDaily(scope, { metrics: ["mort.diaria", "mort.acumulada", "mort.mortes"], from, to });
  const flocks = await getFlocks();
  const strainStd = await getStrainStandards();
  const cum: SeriesSpec[] = [];
  const allW = await readWeekly(scope, { metrics: ["mort.acumulada"], from: "2000-01-01", to: refDate });
  const strains = new Set<string>();
  for (const h of houses) {
    const f = currentFlockOf(flocks, h, refDate);
    if (!f) continue;
    strains.add(f.strainCode);
    cum.push({ name: `${h} · ${f.code}`, color: HOUSE_COLORS[h], data: allW.filter((w) => w.flockId === f.id).map((w) => [w.ageWeek, w.value]) });
  }
  for (const s of strains) {
    const pts: Array<[number, number | null]> = [];
    for (let w = 17; w <= 90; w++) pts.push([w, strainStd.week(s, "mort.acumulada", w)]);
    cum.push({ name: `Curva ${s}`, data: pts, color: STRAIN_LINE_COLOR, dashed: true, width: 1 });
  }
  const sql = getSql();
  const ids = (await getHouses()).filter((h) => houses.includes(h.code)).map((h) => h.id);
  const causes = await sql`select (date - extract(dow from date)::int) as ws, key as cause, sum(value::int)::int as n
    from app.daily_records, jsonb_each_text(deaths_by_cause) where house_id in ${sql(ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])} and date between ${from} and ${to} group by ws, key order by ws`;
  const causeNames: Record<string, string> = { desconhecida: "Desconhecida", refugo: "Refugo", prolapso: "Prolapso", calor: "Calor", outras: "Outras", doenca_respiratoria: "Doença respiratória" };
  const weeks = Array.from(new Set(causes.map((c) => d10(c.ws))));
  const keys = Array.from(new Set(causes.map((c) => c.cause as string)));
  const lab = (w: string) => `${w.slice(8, 10)}/${w.slice(5, 7)}`;
  // calendário de vacinas: registradas × previstas aos 30, 45, 60 e 75 semanas
  const vacc = await listEvents({ houses, categories: ["sanitario"] });
  const calendar = houses.flatMap((h) => {
    const f = currentFlockOf(flocks, h, refDate);
    if (!f) return [];
    return [30, 45, 60, 75].map((w) => {
      const due = addDays(f.hatchDate, w * 7);
      const done = vacc.find((e) => e.typeCode === "sanitario.vacinacao" && e.houses.includes(h) && Math.abs(new Date(e.startDate).getTime() - new Date(due).getTime()) <= 7 * 86400000);
      return { house: h, flock: f.code, week: w, due, done: done ? done.startDate : null, status: done ? "registrada" : due > refDate ? "prevista" : "atrasada" };
    });
  });
  const sanitary = vacc.filter((e) => e.startDate >= addDays(refDate, -120));
  return {
    from,
    to,
    farm: { kind: "timeseries", title: "Mortalidade diária da granja e por galpão", unit: "%", decimals: 3, series: [...houseLines(rows, "mort.diaria", houses), { name: "Granja", data: farmSeries(rows, "mort.diaria", from, to).map((p) => [p.date, p.value]), color: "#111827", width: 3 }], context: { metrica: "mort.diaria" } } satisfies ChartSpec,
    cumulative: { kind: "age", title: "Mortalidade acumulada × curva por lote (semana de idade)", unit: "%", decimals: 2, xLabel: "Semana de idade", series: cum } satisfies ChartSpec,
    causes: { kind: "bar", title: "Mortes por causa (granja, por semana)", unit: "aves", decimals: 0, categories: weeks.map(lab), series: keys.map((k) => ({ name: causeNames[k] ?? k, stack: "c", type: "bar" as const, data: weeks.map((w) => [lab(w), Number(causes.find((c) => d10(c.ws) === w && c.cause === k)?.n ?? 0)] as [string, number]) })) } satisfies ChartSpec,
    calendar,
    sanitary,
  };
}

export async function getNutritionPage(scope: Scope, days: number) {
  const { refDate, houses, from, to } = await base(scope, days);
  const rows = await readDaily(scope, { metrics: ["nut.racao", "nut.agua", "nut.agua_racao", "nut.conv_dz", "nut.peso_corporal", "nut.uniformidade", "qual.trincados"], from, to });
  const flocks = await getFlocks();
  const strainStd = await getStrainStandards();
  const w7 = addDays(refDate, -6);
  const table = houses.map((h) => {
    const f = currentFlockOf(flocks, h, refDate);
    const g = (m: string) => windowAggregate(rows, m, w7, refDate, [h]).byHouse.get(h)?.value ?? null;
    const age = f ? ageWeeksDecimal(addDays(refDate, -3), f.hatchDate) : null;
    const feed = g("nut.racao");
    const water = g("nut.agua");
    const feedDev = f && age ? relativeDeviation(feed, strainStd.at(f.strainCode, "nut.racao", age)) : null;
    const waterDev = f && age ? relativeDeviation(water, strainStd.at(f.strainCode, "nut.agua", age)) : null;
    const bw = g("nut.peso_corporal");
    return { house: h, feed, water, ratio: g("nut.agua_racao"), conv: g("nut.conv_dz"), feedDev, feedStatus: statusForRelativeDeviation(feedDev), waterDev, waterStatus: statusForRelativeDeviation(waterDev), bw, bwStd: f && age ? strainStd.at(f.strainCode, "nut.peso_corporal", age) : null, uni: g("nut.uniformidade") };
  });
  // cargas e trincados por grupo de carga (torna o S4 visível)
  const sql = getSql();
  const batches = await sql`select b.code, b.delivered_on, b.price_per_kg, b.calcium_pct_spec, (select array_agg(h.code order by h.code) from app.houses h where h.id = any(b.house_ids)) as houses
    from app.feed_batches b where b.delivered_on between ${addDays(from, -28)} and ${to} order by b.delivered_on desc`;
  const groups = new Map<string, string[]>();
  for (const b of batches) groups.set((b.houses as string[]).join("+"), b.houses as string[]);
  const groupSeries: SeriesSpec[] = [...groups.entries()]
    .map(([k, hs]) => ({ k, hs: hs.filter((h) => houses.includes(h)) }))
    .filter((g) => g.hs.length)
    .map((g, i) => ({ name: `Grupo ${g.hs.join(", ")}`, color: ["#db2777", "#0891b2", "#4b5563"][i % 3], data: farmSeries(rows.filter((r) => g.hs.includes(r.house)), "qual.trincados", from, to).map((p) => [p.date, p.value]) }));
  return {
    from,
    to,
    table,
    feed: { kind: "timeseries", title: "Ração por ave", unit: "g/ave/dia", decimals: 1, series: houseLines(rows, "nut.racao", houses) } satisfies ChartSpec,
    water: { kind: "timeseries", title: "Água por ave", unit: "mL/ave/dia", decimals: 0, series: houseLines(rows, "nut.agua", houses) } satisfies ChartSpec,
    ratio: { kind: "timeseries", title: "Relação água:ração", unit: "mL/g", decimals: 2, series: houseLines(rows, "nut.agua_racao", houses) } satisfies ChartSpec,
    conv: { kind: "timeseries", title: "Conversão por dúzia", unit: "kg/dz", decimals: 3, series: houseLines(rows, "nut.conv_dz", houses) } satisfies ChartSpec,
    byBatch: { kind: "timeseries", title: "Trincados por grupo de carga de ração", subtitle: "Galpões que recebem as mesmas cargas", unit: "%", decimals: 2, series: groupSeries } satisfies ChartSpec,
    batches: batches.map((b) => ({ code: b.code as string, deliveredOn: d10(b.delivered_on), houses: (b.houses as string[]) ?? [], price: Number(b.price_per_kg), calcium: Number(b.calcium_pct_spec) })),
  };
}

export async function getAmbiencePage(scope: Scope, days: number) {
  const { refDate, houses, from, to } = await base(scope, days);
  const rows = await readDaily(scope, { metrics: ["amb.temp_max", "amb.temp_ext_max", "amb.horas_32", "amb.delta_resfriamento", "amb.nh3_max"], from: addDays(refDate, -59) < from ? addDays(refDate, -59) : from, to });
  const inR = rows.filter((r) => r.date >= from);
  const dates: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) dates.push(d);
  const ext = farmSeries(inR, "amb.temp_ext_max", from, to);
  const cooling = houses
    .map((h) => ({ h, v: mean(inR.filter((r) => r.house === h && r.metric === "amb.delta_resfriamento").map((r) => r.value)) }))
    .sort((a, b) => (b.v ?? -99) - (a.v ?? -99));
  const sql = getSql();
  const fc = await sql`select date, temp_max, temp_min, generated_on from app.weather_forecast order by date`;
  const hs = await getHouses();
  const risk = hs.filter((h) => houses.includes(h.code)).sort((a, b) => a.coolingDelta - b.coolingDelta).slice(0, 3);
  const nFrom = addDays(refDate, -59);
  return {
    from,
    to,
    temps: { kind: "timeseries", title: "Temperatura máxima interna por galpão e externa", unit: "°C", decimals: 1, series: [...houseLines(inR, "amb.temp_max", houses), { name: "Externa", data: ext.map((p) => [p.date, p.value]), color: "#9ca3af", dashed: true, width: 2 }], refLines: [{ name: "32 °C", y: 32, color: "#dc2626", dashed: true }], events: eventMarks((await listEvents({ houses, from, to, categories: ["ambiente"] })).filter((e) => e.houses.length >= Math.min(3, houses.length))) } satisfies ChartSpec,
    heat: { kind: "heatmap", title: "Horas acima de 32 °C por galpão e dia", unit: "h", decimals: 0, series: [], heat: { x: dates, y: houses, values: inR.filter((r) => r.metric === "amb.horas_32").map((r) => [dates.indexOf(r.date), houses.indexOf(r.house), r.value] as [number, number, number | null]), min: 0, max: 8, colors: ["#f8fafc", "#fde68a", "#f97316", "#7f1d1d"] }, height: 60 + houses.length * 34 } satisfies ChartSpec,
    cooling: { kind: "hbar", title: "Ranking de resfriamento (externa máx. − interna máx., média do período)", unit: "°C", decimals: 1, categories: cooling.map((c) => c.h), series: [{ name: "Δ resfriamento", type: "bar", data: cooling.map((c) => [c.h, c.v]) }] } satisfies ChartSpec,
    forecast: fc.map((f) => ({ date: d10(f.date), tmax: Number(f.temp_max), tmin: Number(f.temp_min), hot: Number(f.temp_max) >= 36 })),
    risk: risk.map((h) => ({ code: h.code, delta: h.coolingDelta })),
    nh3: { kind: "timeseries", title: "Amônia máxima (últimos 60 dias)", unit: "ppm", decimals: 1, series: houseLines(rows.filter((r) => r.date >= nFrom), "amb.nh3_max", houses) } satisfies ChartSpec,
  };
}

export { NAME };
