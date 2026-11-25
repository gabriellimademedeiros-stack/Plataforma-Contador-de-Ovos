import "server-only";
import { getSql } from "@/db/client";
import { addDays, ageWeeksDecimal, lastCompleteWeekStart, weekLabel, phaseForAgeWeek, PHASE_LABEL } from "@/lib/dates";
import { emptyCounts, type ClassCounts } from "@/engine/types";
import { financeDay, type FinanceDay } from "@/engine/finance/daily";
import { projectCulling } from "@/engine/finance/culling";
import { forecastHouse, farmForecast, type ForecastWeek } from "@/engine/forecast/forecast";
import { rankHouses, type RankInput } from "@/engine/ranking/houses";
import { median, mean } from "@/engine/stats";
import type { PriceSimHouse } from "@/engine/finance/price-sim";
import { assertFinance, type Scope } from "@/server/permissions";
import { currentFlockOf, getFlocks, getHouses, getRefDate } from "@/server/repositories/reference";
import { getStrainStandards } from "@/server/repositories/config";
import { readDaily, readWeekly, scopedHouseCodes } from "./metrics-query";

const d10 = (v: unknown) => (typeof v === "string" ? v.slice(0, 10) : (v as Date).toISOString().slice(0, 10));

export interface HouseWeekFinance {
  house: string;
  flock: string;
  days: number;
  counts: ClassCounts;
  eggs: number;
  birdDays: number;
  feedKg: number;
  sum: Omit<FinanceDay, "custoDz" | "margemDz" | "equilibrio">;
  margemDz: number | null;
  custoDz: number | null;
  posture: number | null;
  breakEven: number | null;
  marginPerBird: number | null;
  birdsHoused: number;
  egg: number;
  feed: number;
}

/** Quebra financeira de uma semana por galpão, recalculada pelo motor a partir dos dados brutos (Estimado). */
export async function weekFinance(scope: Scope, ws: string, houses?: string[]): Promise<HouseWeekFinance[]> {
  const codes = await scopedHouseCodes(scope, houses);
  if (!codes.length) return [];
  const sql = getSql();
  const we = addDays(ws, 6);
  const [recs, eggs, prices, costs] = await Promise.all([
    sql`select h.code as house, f.code as flock, f.birds_housed, f.planned_cull_age_weeks, f.hatch_date, p.start_date, d.date, d.birds_start, d.feed_kg
        from app.daily_records d join app.houses h on h.id = d.house_id join app.flocks f on f.id = d.flock_id
        join app.flock_placements p on p.flock_id = f.id where h.code in ${sql(codes)} and d.date between ${ws} and ${we}`,
    sql`select h.code as house, e.date, e.egg_class, sum(e.qty)::int as qty from app.egg_counts e join app.houses h on h.id = e.house_id
        where h.code in ${sql(codes)} and e.date between ${ws} and ${we} and e.window_minutes = 1440 group by h.code, e.date, e.egg_class`,
    sql`select item, value_brl from app.prices where week_start = (select max(week_start) from app.prices where week_start <= ${ws})`,
    sql`select key, value from app.cost_params`,
  ]);
  const price = Object.fromEntries(prices.map((p) => [p.item, Number(p.value_brl)])) as Record<string, number>;
  const cost = Object.fromEntries(costs.map((c) => [c.key, Number(c.value)]));
  const byHouse = new Map<string, HouseWeekFinance>();
  for (const r of recs) {
    const date = d10(r.date);
    const c = emptyCounts();
    for (const e of eggs) if (e.house === r.house && d10(e.date) === date) c[e.egg_class as keyof ClassCounts] += Number(e.qty);
    const plannedDays = Number(r.planned_cull_age_weeks) * 7 - Math.round((new Date(d10(r.start_date)).getTime() - new Date(d10(r.hatch_date)).getTime()) / 86400000);
    const fin = financeDay({ counts: c, feedKg: Number(r.feed_kg ?? 0), birds: Number(r.birds_start), birdsHoused: Number(r.birds_housed), plannedDays, prices: price as never, cost });
    let h = byHouse.get(r.house);
    if (!h) {
      h = {
        house: r.house,
        flock: r.flock,
        days: 0,
        counts: emptyCounts(),
        eggs: 0,
        birdDays: 0,
        feedKg: 0,
        sum: { eggs: 0, dzClean: 0, receita: 0, receitaComercial: 0, receitaTrincado: 0, receitaSujo: 0, custoRacao: 0, custoEmbalagem: 0, custoOverhead: 0, custoFixo: 0, custoAve: 0, custoSanidade: 0, custo: 0, margem: 0 },
        margemDz: null,
        custoDz: null,
        posture: null,
        breakEven: null,
        marginPerBird: null,
        birdsHoused: Number(r.birds_housed),
        egg: price.ovo_comercial_dz,
        feed: price.racao_kg,
      };
      byHouse.set(r.house, h);
    }
    h.days++;
    for (const k of Object.keys(c) as (keyof ClassCounts)[]) h.counts[k] += c[k];
    h.eggs += fin.eggs;
    h.birdDays += Number(r.birds_start);
    h.feedKg += Number(r.feed_kg ?? 0);
    for (const k of Object.keys(h.sum) as (keyof HouseWeekFinance["sum"])[]) h.sum[k] += fin[k] as number;
  }
  for (const h of byHouse.values()) {
    const dz = h.eggs / 12;
    h.margemDz = dz > 0 ? h.sum.margem / dz : null;
    h.custoDz = dz > 0 ? h.sum.custo / dz : null;
    h.posture = h.birdDays ? (h.eggs / h.birdDays) * 100 : null;
    h.breakEven = h.sum.receita > 0 && h.birdDays > 0 ? ((h.sum.custo * h.eggs) / (h.sum.receita * h.birdDays)) * 100 : null;
    h.marginPerBird = h.sum.margem / h.birdsHoused;
  }
  return codes.map((c) => byHouse.get(c)).filter((x): x is HouseWeekFinance => !!x);
}

export async function getFinanceOverview(scope: Scope) {
  assertFinance(scope);
  const refDate = await getRefDate();
  const ws = lastCompleteWeekStart(refDate);
  const houses = await weekFinance(scope, ws);
  const tot = houses.reduce(
    (a, h) => {
      for (const k of Object.keys(a) as (keyof typeof a)[]) a[k] += (h.sum as Record<string, number>)[k] ?? 0;
      return a;
    },
    { receita: 0, custoRacao: 0, custoEmbalagem: 0, custoOverhead: 0, custoFixo: 0, custoAve: 0, custoSanidade: 0, custo: 0, margem: 0, eggs: 0 },
  );
  const sql = getSql();
  const evo = await sql`select week_start, metric_code, value from app.farm_weekly_metrics where metric_code in ('fin.receita','fin.custo','fin.margem') and week_start between ${addDays(ws, -7 * 25)} and ${ws} order by week_start`;
  const weeks = Array.from(new Set(evo.map((r) => d10(r.week_start))));
  return {
    weekStart: ws,
    weekLabel: weekLabel(ws),
    houses,
    total: tot,
    evolution: weeks.map((w) => ({ week: w, receita: Number(evo.find((r) => d10(r.week_start) === w && r.metric_code === "fin.receita")?.value ?? 0), custo: Number(evo.find((r) => d10(r.week_start) === w && r.metric_code === "fin.custo")?.value ?? 0), margem: Number(evo.find((r) => d10(r.week_start) === w && r.metric_code === "fin.margem")?.value ?? 0) })),
  };
}

export async function getPriceSimInputs(scope: Scope): Promise<{ weekLabel: string; houses: PriceSimHouse[] }> {
  assertFinance(scope);
  const ws = lastCompleteWeekStart(await getRefDate());
  const rows = await weekFinance(scope, ws);
  return {
    weekLabel: weekLabel(ws),
    houses: rows.map((h) => ({
      house: h.house,
      dzClean: (h.counts.clean + h.counts.undetermined) / 12,
      dzCracked: h.counts.cracked / 12,
      dzDirty: (h.counts.dirty_feces + h.counts.dirty_blood) / 12,
      eggs: h.eggs,
      birdDays: h.birdDays,
      feedKg: h.feedKg,
      otherCosts: h.sum.custo - h.sum.custoRacao,
      currentEgg: h.egg,
      currentFeed: h.feed,
    })),
  };
}

/** Ajuste do lote = mediana de (postura − curva) nos 28 dias anteriores (Parte 8.4, sem os dias de eventos). */
async function adjustments(scope: Scope, refDate: string) {
  const [flocks, std] = await Promise.all([getFlocks(), getStrainStandards()]);
  const rows = await readDaily(scope, { metrics: ["prod.postura"], from: addDays(refDate, -35), to: addDays(refDate, -1) });
  const out = new Map<string, number>();
  for (const h of await scopedHouseCodes(scope)) {
    const f = currentFlockOf(flocks, h, refDate);
    if (!f) continue;
    const diffs = rows.filter((r) => r.house === h && r.qf === 0 && r.value != null).map((r) => r.value! - (std.at(f.strainCode, "prod.postura", ageWeeksDecimal(r.date, f.hatchDate)) ?? r.value!));
    out.set(h, median(diffs) ?? 0);
  }
  return out;
}

export async function getForecast(scope: Scope, weeks = 8): Promise<{ from: string; houses: ForecastWeek[]; farm: ReturnType<typeof farmForecast> }> {
  const refDate = await getRefDate();
  const [flocks, std, adj] = await Promise.all([getFlocks(), getStrainStandards(), adjustments(scope, refDate)]);
  const sql = getSql();
  const birds = await sql`select h.code, d.birds_start - d.deaths - d.culls as present from app.daily_records d join app.houses h on h.id = d.house_id where d.date = ${refDate}`;
  const from = addDays(refDate, 1);
  const all: ForecastWeek[] = [];
  for (const h of await scopedHouseCodes(scope)) {
    const f = currentFlockOf(flocks, h, refDate);
    const b = Number(birds.find((x) => x.code === h)?.present ?? 0);
    if (!f || !b) continue;
    all.push(...forecastHouse({ house: h, flock: f.code, strainCode: f.strainCode, hatchDate: f.hatchDate, plannedCullAgeWeeks: f.plannedCullAgeWeeks, birds: b, adjustment: adj.get(h) ?? 0 }, std, from, weeks));
  }
  return { from, houses: all, farm: farmForecast(all) };
}

export async function getCulling(scope: Scope, flockCode: string) {
  assertFinance(scope);
  const refDate = await getRefDate();
  const flocks = await getFlocks();
  const f = flocks.find((x) => x.code === flockCode && x.status === "ativo");
  if (!f || !scope.houseCodes.has(f.houseCode)) return null;
  const ws = lastCompleteWeekStart(refDate);
  const [wf] = await weekFinance(scope, ws, [f.houseCode]);
  const adj = (await adjustments(scope, refDate)).get(f.houseCode) ?? 0;
  const sql = getSql();
  const [b] = await sql`select d.birds_start - d.deaths - d.culls as present from app.daily_records d join app.houses h on h.id = d.house_id where d.date = ${refDate} and h.code = ${f.houseCode}`;
  const costs = await sql`select key, value from app.cost_params`;
  const total = wf ? wf.eggs : 1;
  const shares = wf
    ? { commercial: (wf.counts.clean + wf.counts.undetermined) / total, cracked: wf.counts.cracked / total, dirty: (wf.counts.dirty_feces + wf.counts.dirty_blood) / total, broken: wf.counts.broken / total }
    : { commercial: 0.95, cracked: 0.025, dirty: 0.02, broken: 0.005 };
  const egg = wf?.egg ?? 5;
  const std = await getStrainStandards();
  const r = projectCulling(
    {
      flock: f.code,
      strainCode: f.strainCode,
      hatchDate: f.hatchDate,
      from: addDays(refDate, 1),
      birds: Number(b?.present ?? 0),
      adjustment: adj,
      shares,
      prices: { egg, cracked: egg * 0.55, dirty: egg * 0.75, feed: wf?.feed ?? 2 },
      cost: Object.fromEntries(costs.map((c) => [c.key, Number(c.value)])),
      weeks: 16,
    },
    std,
    addDays(f.hatchDate, f.plannedCullAgeWeeks * 7),
  );
  return { flock: f.code, house: f.houseCode, strain: f.strainName, ageWeek: Math.floor(ageWeeksDecimal(refDate, f.hatchDate)), adjustment: adj, egg, feed: wf?.feed ?? 2, plannedCull: addDays(f.hatchDate, f.plannedCullAgeWeeks * 7), ...r };
}

export async function getRanking(scope: Scope, phase?: string | null) {
  const refDate = await getRefDate();
  const ws = lastCompleteWeekStart(refDate);
  const [flocks, std] = await Promise.all([getFlocks(), getStrainStandards()]);
  const metrics = ["prod.desvio_interno", "mort.diaria", "qual.avarias", "qual.sujos", "nut.conv_dz", ...(scope.canSeeFinance ? ["fin.margem_ave"] : [])];
  const rows = await readWeekly(scope, { metrics, from: ws, to: ws });
  const items: RankInput[] = [];
  for (const h of await scopedHouseCodes(scope)) {
    const f = currentFlockOf(flocks, h, addDays(ws, 6));
    const g = (m: string) => rows.find((r) => r.house === h && r.metric === m);
    const age = g("mort.diaria")?.ageWeek ?? null;
    if (!f || age == null || age < 26) continue;
    const ph = phaseForAgeWeek(age);
    if (phase && phase !== ph) continue;
    const stdMort = (std.week(f.strainCode, "mort.acumulada", age) ?? 0) - (std.week(f.strainCode, "mort.acumulada", age - 1) ?? 0);
    const p = std.week(f.strainCode, "prod.postura", age);
    const feed = std.week(f.strainCode, "nut.racao", age);
    const convStd = p && feed ? feed / 1000 / (p / 100 / 12) : null;
    const conv = g("nut.conv_dz")?.value ?? null;
    const av = g("qual.avarias")?.value ?? null;
    const sj = g("qual.sujos")?.value ?? null;
    items.push({
      house: h,
      phase: PHASE_LABEL[ph],
      ageWeek: age,
      postureDev: g("prod.desvio_interno")?.value ?? null,
      mortVsStd: g("mort.diaria")?.value != null ? g("mort.diaria")!.value! - stdMort : null,
      defects: av != null && sj != null ? av + sj : null,
      convVsExpected: conv != null && convStd != null ? conv - convStd : null,
      marginPerBird: scope.canSeeFinance ? (g("fin.margem_ave")?.value ?? null) : null,
    });
  }
  return { weekStart: ws, weekLabel: weekLabel(ws), items: rankHouses(items, { includeMargin: scope.canSeeFinance }), includeMargin: scope.canSeeFinance };
}

/** Ranking de linhagens (Parte 12.9). */
export async function getStrainRanking(scope: Scope) {
  const sql = getSql();
  const flocks = await getFlocks();
  const visible = flocks.filter((f) => scope.houseCodes.has(f.houseCode));
  const strains = Array.from(new Set(visible.map((f) => f.strainCode))).sort();
  const w = await sql`select f.code as flock, s.code as strain, m.metric_code, m.age_week, m.value, m.days_count, m.phase
    from app.weekly_metrics m join app.flocks f on f.id = m.flock_id join app.strains s on s.id = f.strain_id join app.houses h on h.id = m.house_id
    where m.metric_code in ('prod.desvio_linhagem','prod.oaa','mort.acumulada','qual.trincados') and h.code in ${sql([...scope.houseCodes])}`;
  return strains.map((s) => {
    const fl = visible.filter((f) => f.strainCode === s);
    const rows = w.filter((r) => r.strain === s);
    const at60 = (metric: string) => {
      const vals = fl.map((f) => rows.find((r) => r.flock === f.code && r.metric_code === metric && Number(r.age_week) === 60)?.value).filter((v) => v != null).map(Number);
      return { mean: mean(vals), n: vals.length };
    };
    const dev = mean(rows.filter((r) => r.metric_code === "prod.desvio_linhagem" && Number(r.days_count) >= 7 && Number(r.age_week) >= 26).map((r) => Number(r.value)));
    const trinc = (ph: string) => mean(rows.filter((r) => r.metric_code === "qual.trincados" && r.phase === ph).map((r) => Number(r.value)));
    return {
      strain: s,
      name: fl[0]?.strainName ?? s,
      active: fl.filter((f) => f.status === "ativo").length,
      closed: fl.filter((f) => f.status === "encerrado").length,
      postureDev: dev,
      oaa60: at60("prod.oaa"),
      mort60: at60("mort.acumulada"),
      cracked: { pico: trinc("pico"), postura1: trinc("postura1"), postura2: trinc("postura2") },
      warning: fl.length < 3 ? "comparação pouco robusta (menos de 3 lotes)" : null,
    };
  });
}

export async function getHouseCodes() {
  return (await getHouses()).map((h) => h.code);
}
