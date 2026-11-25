/** Retratos de todos os eventos (passo 7 da Parte 7.14). */
import type { Dataset } from "@/engine/types";
import type { MetricsResult } from "@/engine/metrics/pipeline";
import { EVENT_TYPE_BY_CODE } from "./event-types";
import { computeEventImpact, eggPriceLookup, type EventImpactResult, type ImpactContext } from "./impact";

export function impactContextFrom(ds: Dataset, m: Pick<MetricsResult, "store" | "strainStd" | "idx">, today = ds.dEnd): ImpactContext {
  return {
    store: m.store,
    flocks: m.idx.flockByCode,
    strainStd: m.strainStd,
    eggPrice: eggPriceLookup(new Map(ds.prices.map((p) => [p.weekStart, p.ovo_comercial_dz]))),
    today,
  };
}

export function computeAllImpacts(ds: Dataset, m: Pick<MetricsResult, "store" | "strainStd" | "idx">): Map<string, EventImpactResult> {
  const ctx = impactContextFrom(ds, m);
  const out = new Map<string, EventImpactResult>();
  for (const e of ds.events) {
    if (e.startDate < m.store.start || e.startDate > m.store.end) continue;
    out.set(e.id, computeEventImpact(ctx, e, EVENT_TYPE_BY_CODE[e.typeCode]?.name ?? e.typeCode));
  }
  return out;
}
