/**
 * Cálculo dos indicadores (Partes 6 e 8). Funções puras: recebem o Dataset em memória e devolvem um MetricStore.
 * Toda métrica de razão guarda numerador e denominador (Parte 4.6).
 */
import { addDays, ageDays, ageWeek, ageWeeksDecimal, dateRange, phaseForAgeWeek, weekStart } from "@/lib/dates";
import {
  EXT,
  buildIndex,
  emptyCounts,
  flockAt,
  totalCounts,
  type ClassCounts,
  type Dataset,
  type DatasetIndex,
  type EventRecord,
  type WeeklyPrices,
} from "@/engine/types";
import { defectLoss, financeDay } from "@/engine/finance/daily";
import { MetricStore } from "./store";
import type { StrainStandards } from "@/engine/standards/strain";
import type { InternalStandards } from "@/engine/standards/internal";

export interface ComputeInput {
  ds: Dataset;
  idx?: DatasetIndex;
  strainStd: StrainStandards;
  internalStd?: InternalStandards | null;
  /** Período a calcular (padrão: todo o Dataset). */
  from?: string;
  to?: string;
  houses?: string[];
}

/** Escala do valor em relação a num/den para métricas de razão (value = num/den × escala). */
export const RATIO_SCALE: Record<string, number> = {
  "prod.postura": 100,
  "prod.aproveitamento": 100,
  "prod.oaa": 1,
  "qual.trincados": 100,
  "qual.quebrados": 100,
  "qual.sujos_fezes": 100,
  "qual.sujos_sangue": 100,
  "qual.avarias": 100,
  "qual.sujos": 100,
  "qual.indeterminados": 100,
  "qual.trincados_pista1": 100,
  "qual.trincados_pista2": 100,
  "mort.diaria": 100,
  "mort.acumulada": 100,
  "mort.viabilidade": 100,
  "nut.racao": 1,
  "nut.agua": 1,
  "nut.agua_racao": 1,
  "nut.conv_dz": 1,
  "nut.conv_massa": 1,
  "fin.custo_dz": 1,
  "fin.margem_dz": 1,
  "fin.margem_ave": 1,
  "ops.completude": 100,
};
for (const k of ["quebrados", "avarias", "sujos_fezes", "sujos_sangue"]) {
  RATIO_SCALE[`qual.${k}_pista1`] = 100;
  RATIO_SCALE[`qual.${k}_pista2`] = 100;
}

export function scaleOf(metric: string): number {
  return RATIO_SCALE[metric] ?? 1;
}

/** Preços da semana de uma data (última semana conhecida se a data for posterior). */
export function pricesFor(idx: DatasetIndex, ds: Dataset, date: string): WeeklyPrices | undefined {
  const ws = weekStart(date);
  const p = idx.pricesByWeek.get(ws);
  if (p) return p;
  let best: WeeklyPrices | undefined;
  for (const x of ds.prices) if (x.weekStart <= ws && (!best || x.weekStart > best.weekStart)) best = x;
  return best ?? ds.prices[0];
}

function sumLanes(lanes: { 1: ClassCounts; 2: ClassCounts }): ClassCounts {
  const c = emptyCounts();
  for (const k of Object.keys(c) as (keyof ClassCounts)[]) c[k] = lanes[1][k] + lanes[2][k];
  return c;
}

/** Custo de eventos por galpão e dia produtivo (Parte 12.1 — custos de eventos do dia). */
function eventCostMap(events: EventRecord[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of events) {
    if (!e.costBrl || e.houses.length === 0) continue;
    const share = e.costBrl / e.houses.length;
    for (const h of e.houses) {
      const k = `${h}|${e.startDate}`;
      m.set(k, (m.get(k) ?? 0) + share);
    }
  }
  return m;
}

export function computeDailyMetrics(input: ComputeInput): MetricStore {
  const { ds, strainStd } = input;
  const idx = input.idx ?? buildIndex(ds);
  const from = input.from ?? ds.dStart;
  const to = input.to ?? ds.dEnd;
  const houses = input.houses ?? ds.houses.map((h) => h.code);
  const store = new MetricStore(from, to, houses);
  const evCost = eventCostMap(ds.events);
  const ext = idx.env.get(EXT);

  for (const house of houses) {
    const meta = store.meta.get(house)!;
    const drs = idx.daily.get(house);
    const eggs = idx.egg.get(house);
    const env = idx.env.get(house);
    const bws = idx.bodyWeights.get(house) ?? [];
    const labs = idx.lab.get(house) ?? [];
    // acumulados desde o alojamento (precisam de dias anteriores a `from`)
    const flocks = idx.flocksByHouse.get(house) ?? [];
    const cum = new Map<string, { eggs: number; deaths: number }>();
    for (const f of flocks) {
      let ce = 0;
      let cd = 0;
      const last = f.endDate && f.endDate < to ? f.endDate : to;
      for (const d of dateRange(f.startDate, last)) {
        const r = drs?.get(d);
        const e = eggs?.get(d);
        if (e) ce += totalCounts(e.lanes[1]) + totalCounts(e.lanes[2]);
        if (r) cd += r.deaths;
        if (d >= from) cum.set(d, { eggs: ce, deaths: cd });
      }
    }

    let bwPtr = 0;
    let labPtr = 0;
    for (let i = 0; i < store.days; i++) {
      const d = store.dateAt(i);
      const f = flockAt(idx, house, d);
      if (!f) continue;
      const aDays = ageDays(d, f.hatchDate);
      const aWeek = ageWeek(d, f.hatchDate);
      const wDec = ageWeeksDecimal(d, f.hatchDate);
      meta.flock[i] = f.code;
      meta.ageDays[i] = aDays;
      meta.ageWeek[i] = aWeek;
      meta.phase[i] = phaseForAgeWeek(aWeek, ds.farm.phaseBounds);

      const S = (metric: string, value: number | null, num?: number | null, den?: number | null, qf = 0) =>
        store.setByIndex(house, metric, i, value, num, den, qf);
      const R = (metric: string, num: number | null, den: number | null, qf = 0) => {
        if (num == null || den == null || !(den > 0)) return S(metric, null, num, den, 2);
        S(metric, (num / den) * scaleOf(metric), num, den, qf);
      };
      const W = (metric: string, value: number | null, weight: number | null) => {
        if (value == null || weight == null || !(weight > 0)) return S(metric, null, null, null, 2);
        S(metric, value, value * weight, weight);
      };

      const r = drs?.get(d);
      const e = eggs?.get(d);
      const birds = r?.birdsStart ?? null;
      const housed = f.birdsHoused;

      // --- Produção e qualidade
      if (e) {
        const c = sumLanes(e.lanes);
        const n = totalCounts(c);
        const qf = e.qualityFlag;
        S("prod.ovos", n, n, null, qf);
        S("prod.caixas", n / 360, n / 360, null, qf);
        S("prod.ovos_pista1", totalCounts(e.lanes[1]), totalCounts(e.lanes[1]), null, qf);
        S("prod.ovos_pista2", totalCounts(e.lanes[2]), totalCounts(e.lanes[2]), null, qf);
        R("prod.postura", n, birds, qf);
        R("prod.aproveitamento", c.clean + c.undetermined, n, qf);
        R("qual.trincados", c.cracked, n, qf);
        R("qual.quebrados", c.broken, n, qf);
        R("qual.sujos_fezes", c.dirty_feces, n, qf);
        R("qual.sujos_sangue", c.dirty_blood, n, qf);
        R("qual.avarias", c.cracked + c.broken, n, qf);
        R("qual.sujos", c.dirty_feces + c.dirty_blood, n, qf);
        R("qual.indeterminados", c.undetermined, n, qf);
        const l1 = e.lanes[1];
        const l2 = e.lanes[2];
        const n1 = totalCounts(l1);
        const n2 = totalCounts(l2);
        R("qual.trincados_pista1", l1.cracked, n1, qf);
        R("qual.trincados_pista2", l2.cracked, n2, qf);
        R("qual.quebrados_pista1", l1.broken, n1, qf);
        R("qual.quebrados_pista2", l2.broken, n2, qf);
        R("qual.avarias_pista1", l1.cracked + l1.broken, n1, qf);
        R("qual.avarias_pista2", l2.cracked + l2.broken, n2, qf);
        R("qual.sujos_fezes_pista1", l1.dirty_feces, n1, qf);
        R("qual.sujos_fezes_pista2", l2.dirty_feces, n2, qf);
        R("qual.sujos_sangue_pista1", l1.dirty_blood, n1, qf);
        R("qual.sujos_sangue_pista2", l2.dirty_blood, n2, qf);
        const a1 = n1 > 0 ? (l1.cracked + l1.broken) / n1 : null;
        const a2 = n2 > 0 ? (l2.cracked + l2.broken) / n2 : null;
        if (a1 != null && a2 != null && Math.min(a1, a2) > 0) S("qual.razao_pistas", Math.max(a1, a2) / Math.min(a1, a2), null, null, qf);
        else S("qual.razao_pistas", null, null, null, 2);
        const cm = cum.get(d);
        if (cm) R("prod.oaa", cm.eggs, housed);
        if (birds) {
          const post = (n / birds) * 100;
          const sp = strainStd.at(f.strainCode, "prod.postura", wDec);
          W("prod.desvio_linhagem", sp == null ? null : post - sp, birds);
          const internal = input.internalStd?.medianAt(f.strainCode, "prod.postura", aWeek);
          const ref = internal != null ? internal : sp;
          W("prod.desvio_interno", ref == null ? null : post - ref, birds);
          if (r?.eggWeightG != null) {
            W("prod.peso_ovo", r.eggWeightG, n);
            W("prod.massa", (post * r.eggWeightG) / 100, birds);
          }
        }
        // financeiro e perda
        const p = pricesFor(idx, ds, d);
        if (p && r && r.feedKg != null && birds) {
          S("qual.perda_brl", defectLoss(c, p), defectLoss(c, p), null);
          const plannedDays = f.plannedCullAgeWeeks * 7 - (ageDays(f.startDate, f.hatchDate) || 119);
          const fin = financeDay({
            counts: c,
            feedKg: r.feedKg,
            birds,
            birdsHoused: housed,
            plannedDays,
            prices: p,
            cost: ds.costParams,
            eventCost: evCost.get(`${house}|${d}`) ?? 0,
          });
          S("fin.receita", fin.receita, fin.receita, null);
          S("fin.custo", fin.custo, fin.custo, null);
          S("fin.margem", fin.margem, fin.margem, null);
          R("fin.custo_dz", fin.custo, n / 12);
          R("fin.margem_dz", fin.margem, n / 12);
          R("fin.margem_ave", fin.margem, housed);
          S("fin.postura_equilibrio", fin.equilibrio, fin.custo * n, fin.receita * birds);
        }
        S("ops.completude", 100, 1, 1);
      } else {
        for (const m of ["prod.ovos", "prod.postura", "qual.trincados", "qual.sujos_fezes", "qual.sujos_sangue"]) S(m, null, null, null, 2);
        S("ops.completude", 0, 0, 1);
      }

      // --- Mortalidade
      if (r) {
        const present = r.birdsStart - r.deaths - r.culls;
        S("mort.mortes", r.deaths, r.deaths, null);
        R("mort.diaria", r.deaths, r.birdsStart);
        const cm = cum.get(d);
        if (cm) {
          R("mort.acumulada", cm.deaths, housed);
          const std = strainStd.at(f.strainCode, "mort.acumulada", wDec);
          const acc = (cm.deaths / housed) * 100;
          if (std != null) S("mort.desvio_acumulada", acc - std, (acc - std) * housed, housed);
        }
        R("mort.viabilidade", present, housed);
        S("mort.prolapso", r.deathsByCause.prolapso ?? 0, r.deathsByCause.prolapso ?? 0, null);
        S("mort.calor", r.deathsByCause.calor ?? 0, r.deathsByCause.calor ?? 0, null);

        // --- Nutrição
        if (r.feedKg != null) R("nut.racao", r.feedKg * 1000, r.birdsStart);
        else S("nut.racao", null, null, null, 2);
        if (r.waterL != null) R("nut.agua", r.waterL * 1000, r.birdsStart);
        else S("nut.agua", null, null, null, 2);
        if (r.feedKg != null && r.waterL != null) R("nut.agua_racao", r.waterL * 1000, r.feedKg * 1000);
        if (e && r.feedKg != null) {
          const n = totalCounts(e.lanes[1]) + totalCounts(e.lanes[2]);
          R("nut.conv_dz", r.feedKg, n / 12);
          if (r.eggWeightG != null) R("nut.conv_massa", r.feedKg, (n * r.eggWeightG) / 1000);
        }
      }

      // pesagem (último valor do lote)
      while (bwPtr < bws.length && bws[bwPtr].date <= d) bwPtr++;
      const bw = bwPtr > 0 ? bws[bwPtr - 1] : undefined;
      if (bw && bw.flock === f.code && birds) {
        W("nut.peso_corporal", bw.meanG, birds);
        W("nut.uniformidade", bw.uniformityPct, birds);
      } else {
        S("nut.peso_corporal", null, null, null, 2);
        S("nut.uniformidade", null, null, null, 2);
      }

      // laboratório (última amostra do lote nos últimos 7 dias)
      while (labPtr < labs.length && labs[labPtr].date <= d) labPtr++;
      const lab = labPtr > 0 ? labs[labPtr - 1] : undefined;
      const labOk = lab && lab.flock === f.code && addDays(lab.date, 7) > d;
      const wt = birds ?? 1;
      W("lab.resistencia", labOk ? lab!.strength : null, wt);
      W("lab.espessura", labOk ? lab!.thickness : null, wt);
      W("lab.gravidade", labOk ? lab!.gravity : null, wt);
      W("lab.haugh", labOk ? lab!.haugh : null, wt);
      W("lab.peso_ovo", labOk ? lab!.eggWeight : null, wt);

      // --- Ambiência
      const en = env?.get(d);
      const ex = ext?.get(d);
      if (en) {
        S("amb.temp_max", en.tempMax);
        S("amb.temp_min", en.tempMin);
        W("amb.temp_media", en.tempMean, 1);
        S("amb.horas_30", en.hoursAbove30, en.hoursAbove30, null);
        S("amb.horas_32", en.hoursAbove32, en.hoursAbove32, null);
        S("amb.graus_hora_30", en.degreeHours30, en.degreeHours30, null);
        W("amb.umidade", en.rhMean, 1);
        S("amb.nh3_max", en.nh3Max, null, null, en.nh3Max == null ? 2 : 0);
        S("amb.temp_noturna_max", en.nightMax);
        if (ex) W("amb.delta_resfriamento", ex.tempMax - en.tempMax, 1);
      } else {
        for (const m of ["amb.temp_max", "amb.temp_min", "amb.temp_media", "amb.horas_32"]) S(m, null, null, null, 2);
      }
      if (ex) S("amb.temp_ext_max", ex.tempMax);
    }
  }
  return store;
}

// ---------------------------------------------------------------------------
// Agregação semanal e da granja (Parte 8.2) — respeitando a Parte 4.6
// ---------------------------------------------------------------------------

export interface AggRow {
  house: string | null;
  flock: string | null;
  key: string; // data (diário) ou week_start (semanal)
  metric: string;
  value: number | null;
  num: number | null;
  den: number | null;
  daysCount?: number;
  ageWeek?: number;
  phase?: string;
}

type AggKind = "soma" | "razao" | "media_ponderada" | "ultimo" | "max" | "min";

export function aggregate(
  metric: string,
  kind: AggKind,
  cells: Array<{ value: number | null; num: number | null; den: number | null }>,
): { value: number | null; num: number | null; den: number | null } {
  const valid = cells.filter((c) => c.value != null);
  if (valid.length === 0) return { value: null, num: null, den: null };
  switch (kind) {
    case "soma": {
      const s = valid.reduce((a, c) => a + (c.value as number), 0);
      return { value: s, num: s, den: null };
    }
    case "razao":
    case "media_ponderada": {
      let n = 0;
      let d = 0;
      for (const c of valid) {
        if (c.num == null || c.den == null) continue;
        n += c.num;
        d += c.den;
      }
      if (d <= 0) return { value: null, num: n, den: d };
      return { value: (n / d) * (kind === "razao" ? scaleOf(metric) : 1), num: n, den: d };
    }
    case "ultimo": {
      const last = valid[valid.length - 1];
      return { value: last.value, num: last.num, den: last.den };
    }
    case "max": {
      const m = Math.max(...valid.map((c) => c.value as number));
      return { value: m, num: null, den: null };
    }
    case "min": {
      const m = Math.min(...valid.map((c) => c.value as number));
      return { value: m, num: null, den: null };
    }
  }
}

/** Indicadores semanais por galpão (domingo a sábado). */
export function computeWeekly(store: MetricStore, catalog: Record<string, { aggregation: AggKind }>): AggRow[] {
  const out: AggRow[] = [];
  for (const house of store.houses) {
    const meta = store.meta.get(house)!;
    // agrupa índices por (semana, lote)
    const groups = new Map<string, number[]>();
    for (let i = 0; i < store.days; i++) {
      const fl = meta.flock[i];
      if (!fl) continue;
      const k = `${weekStart(store.dateAt(i))}|${fl}`;
      let g = groups.get(k);
      if (!g) groups.set(k, (g = []));
      g.push(i);
    }
    for (const [k, ids] of groups) {
      const [ws, flock] = k.split("|");
      const lastI = ids[ids.length - 1];
      const ageWk = meta.ageWeek[lastI];
      const phase = meta.phase[lastI] ?? "";
      const cellsOf = (metric: string) =>
        ids.map((i) => {
          const d = store.dateAt(i);
          const v = store.get(house, metric, d);
          const nd = store.getNumDen(house, metric, d);
          return { value: v, num: nd.num, den: nd.den };
        });
      const vals: Record<string, { value: number | null; num: number | null; den: number | null }> = {};
      for (const metric of store.metricsOf(house)) {
        const def = catalog[metric];
        if (!def) continue;
        const cells = cellsOf(metric);
        let agg = aggregate(metric, def.aggregation, cells);
        if (metric === "mort.diaria") {
          // semana: Σ mortes ÷ aves no início da semana × 100 (mortalidade semanal)
          const first = cells.find((c) => c.den != null);
          const deaths = cells.reduce((a, c) => a + (c.num ?? 0), 0);
          agg = first?.den ? { value: (deaths / first.den) * 100, num: deaths, den: first.den } : { value: null, num: null, den: null };
        } else if (metric === "fin.margem_ave") {
          const last = [...cells].reverse().find((c) => c.den != null);
          const m = cells.reduce((a, c) => a + (c.num ?? 0), 0);
          agg = last?.den ? { value: m / last.den, num: m, den: last.den } : { value: null, num: null, den: null };
        }
        vals[metric] = agg;
      }
      // postura de equilíbrio sobre os totais da semana
      if (vals["fin.custo"]?.value != null && vals["fin.receita"]?.value && vals["prod.postura"]?.num != null) {
        const p = vals["prod.postura"];
        const eq = ((vals["fin.custo"].value as number) / (vals["fin.receita"].value as number)) * ((p.num as number) / (p.den as number)) * 100;
        vals["fin.postura_equilibrio"] = { value: eq, num: (vals["fin.custo"].value as number) * (p.num as number), den: (vals["fin.receita"].value as number) * (p.den as number) };
      }
      for (const [metric, v] of Object.entries(vals)) {
        out.push({ house, flock, key: ws, metric, ...v, daysCount: ids.length, ageWeek: ageWk, phase });
      }
    }
  }
  return out;
}

/** Agregado da granja (diário ou semanal) a partir de numeradores e denominadores dos galpões. */
export function computeFarm(rows: AggRow[], catalog: Record<string, { aggregation: AggKind }>, weekly: boolean): AggRow[] {
  const groups = new Map<string, AggRow[]>();
  for (const r of rows) {
    const k = `${r.key}|${r.metric}`;
    let g = groups.get(k);
    if (!g) groups.set(k, (g = []));
    g.push(r);
  }
  const out: AggRow[] = [];
  const byKey = new Map<string, Map<string, AggRow>>();
  for (const [k, g] of groups) {
    const [key, metric] = k.split("|");
    const def = catalog[metric];
    if (!def) continue;
    let kind: AggKind = def.aggregation;
    if (kind === "ultimo") kind = "razao"; // soma dos numeradores e denominadores do último dia de cada galpão
    let agg = aggregate(metric, kind, g);
    if (def.aggregation === "ultimo" && agg.den != null && agg.num != null) {
      agg = { ...agg, value: agg.den > 0 ? (agg.num / agg.den) * (RATIO_SCALE[metric] ?? 1) : null };
    }
    if (metric === "mort.diaria" && weekly) {
      const n = g.reduce((a, c) => a + (c.num ?? 0), 0);
      const d = g.reduce((a, c) => a + (c.den ?? 0), 0);
      agg = { value: d > 0 ? (n / d) * 100 : null, num: n, den: d };
    }
    if (metric === "fin.margem_ave") {
      const n = g.reduce((a, c) => a + (c.num ?? 0), 0);
      const d = g.reduce((a, c) => a + (c.den ?? 0), 0);
      agg = { value: d > 0 ? n / d : null, num: n, den: d };
    }
    const row: AggRow = { house: null, flock: null, key, metric, ...agg, daysCount: Math.max(...g.map((x) => x.daysCount ?? 1)) };
    out.push(row);
    let m = byKey.get(key);
    if (!m) byKey.set(key, (m = new Map()));
    m.set(metric, row);
  }
  // postura de equilíbrio da granja sobre os totais
  for (const [, m] of byKey) {
    const c = m.get("fin.custo");
    const rc = m.get("fin.receita");
    const p = m.get("prod.postura");
    const eq = m.get("fin.postura_equilibrio");
    if (c?.value != null && rc?.value && p?.num != null && p.den && eq) {
      eq.value = (c.value / rc.value) * (p.num / p.den) * 100;
    }
  }
  return out;
}

/** Converte o MetricStore em linhas diárias (por galpão). */
export function dailyRows(store: MetricStore): AggRow[] {
  const out: AggRow[] = [];
  for (const c of store.cells()) {
    const meta = store.meta.get(c.house)!;
    out.push({
      house: c.house,
      flock: meta.flock[c.i],
      key: store.dateAt(c.i),
      metric: c.metric,
      value: c.value,
      num: c.num,
      den: c.den,
      daysCount: 1,
      ageWeek: meta.ageWeek[c.i],
      phase: meta.phase[c.i] ?? undefined,
    });
  }
  return out;
}
