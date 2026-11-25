/**
 * Retratos de impacto de eventos (Parte 9.2 a 9.5). Funções puras sobre o MetricStore.
 */
import { addDays, ageWeeksDecimal, diffDays, minDate, weekStart } from "@/lib/dates";
import { clampNum, mean, median, robustSd } from "@/engine/stats";
import { METRIC_BY_CODE } from "@/engine/metrics/catalog";
import type { MetricStore } from "@/engine/metrics/store";
import type { StrainStandards } from "@/engine/standards/strain";
import type { EventRecord, Flock } from "@/engine/types";
import { EVENT_TYPE_BY_CODE, effectDaysFor } from "./event-types";

/** Ordem da impressão digital (Parte 9.4). */
export const FINGERPRINT_METRICS = [
  "prod.postura",
  "prod.peso_ovo",
  "qual.trincados",
  "qual.quebrados",
  "qual.sujos_fezes",
  "qual.sujos_sangue",
  "mort.diaria",
  "nut.racao",
  "nut.agua",
  "nut.agua_racao",
  "amb.temp_max",
  "amb.temp_noturna_max",
] as const;

/** Métricas com curva da linhagem: o Δ desconta a tendência de idade. */
export const AGE_TREND_METRICS = new Set(["prod.postura", "prod.peso_ovo", "nut.racao", "nut.agua"]);

/** Pisos do desvio-padrão robusto (Parte 9.2). */
export const SD_FLOOR: Record<string, number> = {
  "prod.postura": 0.5,
  "nut.racao": 1.5,
  "nut.agua": 4,
  "nut.agua_racao": 0.04,
  "qual.trincados": 0.15,
  "qual.sujos_fezes": 0.15,
  "qual.sujos_sangue": 0.05,
  "qual.quebrados": 0.05,
  "mort.diaria": 0.004,
  "prod.peso_ovo": 0.3,
  "amb.temp_max": 0.5,
  "amb.temp_noturna_max": 0.5,
};

export interface ImpactRow {
  eventId: string;
  house: string;
  metric: string;
  isControl: boolean;
  baseMean: number | null;
  baseRobustSd: number | null;
  effectMean: number | null;
  deltaAbs: number | null;
  deltaPct: number | null;
  z: number | null;
  worstValue: number | null;
  lagDays: number | null;
  recoveryDays: number | null;
  lossEggs: number | null;
  lossBrl: number | null;
  windowClosed: boolean;
}

export interface ImpactContext {
  store: MetricStore;
  flocks: Map<string, Flock>;
  strainStd: StrainStandards;
  /** Preço do ovo comercial (R$/dz) da semana de uma data. */
  eggPrice: (date: string) => number | null;
  /** "Hoje" = último dia com dados. */
  today: string;
}

export interface EventWindows {
  baseFrom: string;
  baseTo: string;
  effectFrom: string;
  effectTo: string;
  effectDays: number;
  recoveryDays: number;
  closed: boolean;
}

export function eventWindows(e: Pick<EventRecord, "typeCode" | "startDate" | "endDate">, today: string): EventWindows | null {
  const def = EVENT_TYPE_BY_CODE[e.typeCode];
  if (!def) return null;
  const dur = e.endDate ? diffDays(e.startDate, e.endDate) + 1 : 1;
  const eff = effectDaysFor(def, dur);
  return {
    baseFrom: addDays(e.startDate, -def.baseDays),
    baseTo: addDays(e.startDate, -1),
    effectFrom: e.startDate,
    effectTo: minDate(addDays(e.startDate, Math.max(0, eff - 1)), today),
    effectDays: eff,
    recoveryDays: def.recoveryDays,
    closed: today >= addDays(e.startDate, eff + def.recoveryDays),
  };
}

function validSeries(store: MetricStore, house: string, metric: string, from: string, to: string) {
  const out: Array<{ date: string; v: number }> = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const v = store.getValid(house, metric, d);
    if (v != null) out.push({ date: d, v });
  }
  return out;
}

/** Retrato de uma métrica num galpão. */
export function impactForMetric(ctx: ImpactContext, e: EventRecord, house: string, metric: string, isControl: boolean, w: EventWindows): ImpactRow {
  const base = validSeries(ctx.store, house, metric, w.baseFrom, w.baseTo);
  const eff = validSeries(ctx.store, house, metric, w.effectFrom, w.effectTo);
  const row: ImpactRow = {
    eventId: e.id,
    house,
    metric,
    isControl,
    baseMean: null,
    baseRobustSd: null,
    effectMean: null,
    deltaAbs: null,
    deltaPct: null,
    z: null,
    worstValue: null,
    lagDays: null,
    recoveryDays: null,
    lossEggs: null,
    lossBrl: null,
    windowClosed: w.closed,
  };
  if (base.length < 2 || eff.length === 0) return row;
  const bm = mean(base.map((x) => x.v))!;
  const sd = robustSd(base.map((x) => x.v), SD_FLOOR[metric] ?? 0)!;
  const em = mean(eff.map((x) => x.v))!;
  // Δ descontada a tendência de idade da curva da linhagem (lote se compara com a própria idade)
  let trend = 0;
  if (AGE_TREND_METRICS.has(metric)) {
    const code = ctx.store.flockAt(house, e.startDate);
    const f = code ? ctx.flocks.get(code) : undefined;
    if (f) {
      const midOf = (a: string, b: string) => addDays(a, Math.floor(diffDays(a, b) / 2));
      const sb = ctx.strainStd.at(f.strainCode, metric, ageWeeksDecimal(midOf(base[0].date, base[base.length - 1].date), f.hatchDate));
      const se = ctx.strainStd.at(f.strainCode, metric, ageWeeksDecimal(midOf(eff[0].date, eff[eff.length - 1].date), f.hatchDate));
      if (sb != null && se != null) trend = se - sb;
    }
  }
  row.baseMean = bm;
  row.baseRobustSd = sd;
  row.effectMean = em;
  row.deltaAbs = em - bm - trend;
  row.deltaPct = bm !== 0 ? row.deltaAbs / bm : null;
  row.z = sd > 0 ? row.deltaAbs / sd : null;
  const dir = METRIC_BY_CODE[metric]?.direction ?? "neutro";
  let worst = eff[0];
  for (const x of eff) {
    if (dir === "maior_melhor" ? x.v < worst.v : dir === "menor_melhor" ? x.v > worst.v : Math.abs(x.v - bm) > Math.abs(worst.v - bm)) worst = x;
  }
  row.worstValue = worst.v;
  row.lagDays = diffDays(e.startDate, worst.date);
  // recuperação: média móvel de 3 dias volta para base ± 1 dp, dentro de efeito + recuperação
  const limit = minDate(addDays(e.startDate, w.effectDays + w.recoveryDays), ctx.today);
  const after = validSeries(ctx.store, house, metric, worst.date, limit);
  for (let i = 2; i < after.length; i++) {
    const ma = (after[i].v + after[i - 1].v + after[i - 2].v) / 3;
    if (Math.abs(ma - bm) <= sd) {
      row.recoveryDays = diffDays(e.startDate, after[i].date);
      break;
    }
  }
  // perda de ovos (só postura): Σ max(0, esperado − real)/100 × aves, esperado = base corrigida pela tendência de idade
  if (metric === "prod.postura") {
    const code = ctx.store.flockAt(house, e.startDate);
    const f = code ? ctx.flocks.get(code) : undefined;
    if (f) {
      const mid = addDays(w.baseFrom, Math.floor(diffDays(w.baseFrom, w.baseTo) / 2));
      const pMid = ctx.strainStd.at(f.strainCode, "prod.postura", ageWeeksDecimal(mid, f.hatchDate));
      let eggs = 0;
      let brl = 0;
      for (let d = w.effectFrom; d <= limit; d = addDays(d, 1)) {
        const real = ctx.store.getValid(house, metric, d);
        const birds = ctx.store.getNumDen(house, metric, d).den;
        const pD = ctx.strainStd.at(f.strainCode, "prod.postura", ageWeeksDecimal(d, f.hatchDate));
        if (real == null || !birds || pMid == null || pD == null) continue;
        const expected = bm + (pD - pMid);
        const lost = (Math.max(0, expected - real) / 100) * birds;
        eggs += lost;
        brl += (lost / 12) * (ctx.eggPrice(d) ?? 0);
      }
      row.lossEggs = eggs;
      row.lossBrl = brl;
    }
  }
  return row;
}

export interface EventImpactResult {
  rows: ImpactRow[];
  fingerprints: Array<{ house: string; vector: (number | null)[] }>;
  /** Diferença contra o controle por galpão afetado e métrica: Δ − mediana dos Δ dos controles. */
  controlDiff: Record<string, Record<string, number | null>>;
  allFarm: boolean;
  summary: string;
  summaries: Record<string, string>;
  windows: EventWindows | null;
}

/** Calcula o retrato completo de um evento (galpões do escopo + controles). */
export function computeEventImpact(ctx: ImpactContext, e: EventRecord, typeName: string): EventImpactResult {
  const w = eventWindows(e, ctx.today);
  const empty: EventImpactResult = { rows: [], fingerprints: [], controlDiff: {}, allFarm: false, summary: "Sem impacto relevante nos indicadores.", summaries: {}, windows: w };
  if (!w || EVENT_TYPE_BY_CODE[e.typeCode].baseDays === 0) return empty;
  const active = ctx.store.houses.filter((h) => ctx.store.flockAt(h, e.startDate) != null);
  const scope = e.houses.filter((h) => active.includes(h));
  const controls = active.filter((h) => !scope.includes(h));
  const rows: ImpactRow[] = [];
  for (const h of scope) for (const m of FINGERPRINT_METRICS) rows.push(impactForMetric(ctx, e, h, m, false, w));
  for (const h of controls) for (const m of FINGERPRINT_METRICS) rows.push(impactForMetric(ctx, e, h, m, true, w));
  const allFarm = controls.length === 0;
  const controlDiff: EventImpactResult["controlDiff"] = {};
  const ctrlMedian: Record<string, number | null> = {};
  for (const m of FINGERPRINT_METRICS) ctrlMedian[m] = median(rows.filter((r) => r.isControl && r.metric === m).map((r) => r.deltaAbs));
  for (const h of scope) {
    controlDiff[h] = {};
    for (const m of FINGERPRINT_METRICS) {
      const r = rows.find((x) => x.house === h && x.metric === m && !x.isControl);
      controlDiff[h][m] = !allFarm && r?.deltaAbs != null && ctrlMedian[m] != null ? r.deltaAbs - ctrlMedian[m]! : null;
    }
  }
  const fingerprints = scope.map((h) => ({ house: h, vector: fingerprintOf(rows, controlDiff, h, allFarm) }));
  const summaries: Record<string, string> = {};
  for (const h of scope) summaries[h] = summaryText(ctx, e, typeName, h, rows, controlDiff, allFarm);
  // resumo do evento: galpão mais afetado (maior |z| ajustado)
  let best = scope[0];
  let bestZ = -1;
  for (const h of scope) {
    const z = Math.max(0, ...fingerprints.find((f) => f.house === h)!.vector.map((v) => Math.abs(v ?? 0)));
    if (z > bestZ) {
      bestZ = z;
      best = h;
    }
  }
  let summary = best ? summaries[best] : empty.summary;
  if (scope.length > 1 && best) summary = `${scope.length} galpões no escopo; maior impacto no ${best}. ${summaries[best]}`;
  return { rows, fingerprints, controlDiff, allFarm, summary, summaries, windows: w };
}

/** z ajustado pelo controle quando há controles; senão o z bruto. Limitado a ±6. */
export function adjustedZ(rows: ImpactRow[], controlDiff: EventImpactResult["controlDiff"], house: string, metric: string, allFarm: boolean): number | null {
  const r = rows.find((x) => x.house === house && x.metric === metric && !x.isControl);
  if (!r || r.z == null || !r.baseRobustSd) return null;
  const z = allFarm ? r.z : controlDiff[house]?.[metric] != null ? controlDiff[house][metric]! / r.baseRobustSd : r.z;
  return clampNum(z, -6, 6);
}

export function fingerprintOf(rows: ImpactRow[], controlDiff: EventImpactResult["controlDiff"], house: string, allFarm: boolean): (number | null)[] {
  return FINGERPRINT_METRICS.map((m) => adjustedZ(rows, controlDiff, house, m, allFarm));
}

const nf = (v: number, d: number) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
const signed = (v: number, d: number) => `${v < 0 ? "−" : "+"}${nf(Math.abs(v), d)}`;

/** Resumo determinístico (Parte 9.5). */
export function summaryText(ctx: ImpactContext, e: EventRecord, typeName: string, house: string, rows: ImpactRow[], controlDiff: EventImpactResult["controlDiff"], allFarm: boolean): string {
  const code = ctx.store.flockAt(house, e.startDate);
  const f = code ? ctx.flocks.get(code) : undefined;
  const age = f ? Math.floor(ageWeeksDecimal(e.startDate, f.hatchDate)) : null;
  const head = `${typeName} no ${house} (${code ?? "sem lote"}${age != null ? `, ${age} semanas` : ""})`;
  const zs = FINGERPRINT_METRICS.map((m) => ({ m, z: adjustedZ(rows, controlDiff, house, m, allFarm) })).filter((x) => x.z != null);
  const relevant = zs.filter((x) => Math.abs(x.z!) >= 2).sort((a, b) => Math.abs(b.z!) - Math.abs(a.z!)).slice(0, 3);
  if (relevant.length === 0) return `${head}: sem impacto relevante nos indicadores.`;
  const parts = relevant.map(({ m }) => {
    const r = rows.find((x) => x.house === house && x.metric === m && !x.isControl)!;
    const def = METRIC_BY_CODE[m];
    const unit = def.unit === "%" ? " p.p." : ` ${def.unit}`;
    const d = def.unit === "%" ? 2 : def.decimals;
    return `${def.short.toLowerCase()} ${signed(r.deltaAbs!, d)}${unit} (pior valor no dia ${r.lagDays})`;
  });
  const p = rows.find((x) => x.house === house && x.metric === "prod.postura" && !x.isControl);
  const rec = p?.recoveryDays != null ? `postura recuperou em ${p.recoveryDays} dias` : p?.windowClosed ? "postura não recuperou dentro da janela" : "recuperação ainda em acompanhamento";
  const loss = p?.lossEggs != null && p.lossEggs >= 1 ? `; perda estimada de ${nf(Math.round(p.lossEggs), 0)} ovos (R$ ${nf(p.lossBrl ?? 0, 2)})` : "";
  return `${head}: ${parts.join("; ")}; ${rec}${loss}.`;
}

/** Preço do ovo comercial da semana de uma data, a partir de um mapa semana → preço. */
export function eggPriceLookup(byWeek: Map<string, number>): (date: string) => number | null {
  const keys = [...byWeek.keys()].sort();
  return (date: string) => {
    const ws = weekStart(date);
    const v = byWeek.get(ws);
    if (v != null) return v;
    let best: string | undefined;
    for (const k of keys) if (k <= ws) best = k;
    return best ? byWeek.get(best)! : null;
  };
}
