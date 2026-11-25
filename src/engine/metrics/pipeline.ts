/** Cálculo completo dos indicadores (passo 6 da Parte 7.14), em memória. */
import { ageWeek, ageWeeksDecimal } from "@/lib/dates";
import { buildIndex, type Dataset, type DatasetIndex } from "@/engine/types";
import { METRIC_BY_CODE, METRICS } from "./catalog";
import { computeDailyMetrics, computeFarm, computeWeekly, dailyRows, type AggRow } from "./compute";
import type { MetricStore } from "./store";
import { InternalStandards, computeInternalStandards, type InternalStandardRow } from "@/engine/standards/internal";
import { StrainStandards, type StrainStandardRow } from "@/engine/standards/strain";
import { STRAINS } from "@/simulator/config";
import { strainStandardTable } from "@/simulator/curves";

export const CATALOG_AGG = Object.fromEntries(METRICS.map((m) => [m.code, { aggregation: m.aggregation }]));

export interface MetricsResult {
  idx: DatasetIndex;
  store: MetricStore;
  weekly: AggRow[];
  farmDaily: AggRow[];
  farmWeekly: AggRow[];
  internal: InternalStandards;
  internalRows: InternalStandardRow[];
  strainStd: StrainStandards;
}

/** Tabela de padrões das linhagens fictícias (a mesma gravada em strain_standards). */
export function defaultStrainStandardRows(): StrainStandardRow[] {
  return STRAINS.flatMap((s) => strainStandardTable(s).map((r) => ({ strainCode: s.code, ageWeek: r.ageWeek, metric: r.metric, value: r.value })));
}

/** Preenche o desvio × padrão interno depois de calculado o padrão interno. */
export function applyInternalDeviation(store: MetricStore, ds: Dataset, idx: DatasetIndex, internal: InternalStandards, strainStd: StrainStandards) {
  for (const house of store.houses) {
    for (let i = 0; i < store.days; i++) {
      const d = store.dateAt(i);
      const code = store.meta.get(house)!.flock[i];
      if (!code) continue;
      const f = idx.flockByCode.get(code)!;
      const post = store.get(house, "prod.postura", d);
      const birds = store.getNumDen(house, "prod.postura", d).den;
      if (post == null || !birds) continue;
      const wk = ageWeek(d, f.hatchDate);
      const ref = internal.medianAt(f.strainCode, "prod.postura", wk) ?? strainStd.at(f.strainCode, "prod.postura", ageWeeksDecimal(d, f.hatchDate));
      if (ref == null) continue;
      store.setByIndex(house, "prod.desvio_interno", i, post - ref, (post - ref) * birds, birds, store.quality(house, "prod.postura", d));
    }
  }
}

/**
 * `internalRows`: padrão interno já calculado (recálculo de uma janela curta usa o padrão gravado no banco,
 * em vez de recalculá-lo com poucos dados).
 */
export function computeAllMetrics(ds: Dataset, opts: { strainRows?: StrainStandardRow[]; from?: string; to?: string; internalRows?: InternalStandardRow[] } = {}): MetricsResult {
  const idx = buildIndex(ds);
  const strainStd = new StrainStandards(opts.strainRows ?? defaultStrainStandardRows());
  const store = computeDailyMetrics({ ds, idx, strainStd, from: opts.from, to: opts.to });
  const weekly1 = computeWeekly(store, CATALOG_AGG);
  const internalRows = opts.internalRows ?? computeInternalStandards(weekly1, ds.flocks, ds.events);
  const internal = new InternalStandards(internalRows);
  applyInternalDeviation(store, ds, idx, internal, strainStd);
  const weekly = computeWeekly(store, CATALOG_AGG);
  const farmDaily = computeFarm(dailyRows(store), CATALOG_AGG, false);
  const farmWeekly = computeFarm(weekly, CATALOG_AGG, true);
  return { idx, store, weekly, farmDaily, farmWeekly, internal, internalRows, strainStd };
}

export { METRIC_BY_CODE };
