/** Monta o contexto das regras a partir dos indicadores em memória (backtest e testes de cenário). */
import { addDays, diffDays } from "@/lib/dates";
import type { Dataset } from "@/engine/types";
import type { MetricsResult } from "@/engine/metrics/pipeline";
import type { AggRow } from "@/engine/metrics/compute";
import { EVENT_TYPE_BY_CODE, effectDaysFor } from "@/engine/impacts/event-types";
import { RULES } from "./rules";
import type { RuleContext } from "./conditions";

export function defaultParams(): Record<string, Record<string, number>> {
  return Object.fromEntries(RULES.map((r) => [r.code, { ...r.params }]));
}

/** Dias dentro da janela de efeito de eventos (excluídos do ajuste do lote, Parte 8.4). */
export function eventExclusion(ds: Pick<Dataset, "events">): (house: string, date: string) => boolean {
  const wins = new Map<string, Array<[string, string]>>();
  for (const e of ds.events) {
    const def = EVENT_TYPE_BY_CODE[e.typeCode];
    if (!def || e.certainty === "descartado" || def.effectDays === 0) continue;
    if (e.scenario === "rotina") continue;
    const dur = e.endDate ? diffDays(e.startDate, e.endDate) + 1 : 1;
    const w: [string, string] = [e.startDate, addDays(e.startDate, effectDaysFor(def, dur) - 1)];
    for (const h of e.houses) {
      const a = wins.get(h) ?? [];
      a.push(w);
      wins.set(h, a);
    }
  }
  return (house, date) => (wins.get(house) ?? []).some(([a, b]) => date >= a && date <= b);
}

export function weeklyLookup(rows: AggRow[], metric: string) {
  const m = new Map<string, AggRow>();
  for (const r of rows) if (r.metric === metric && r.house) m.set(`${r.house}|${r.key}`, r);
  return m;
}

export function buildRuleContext(ds: Dataset, m: MetricsResult, params = defaultParams()): RuleContext {
  const margin = weeklyLookup(m.weekly, "fin.margem");
  const post = weeklyLookup(m.weekly, "prod.postura");
  return {
    store: m.store,
    flocks: m.idx.flockByCode,
    strainStd: m.strainStd,
    internal: m.internal,
    expected: { store: m.store, strainStd: m.strainStd, flocks: m.idx.flockByCode, excluded: eventExclusion(ds), betaCache: new Map() },
    params,
    weeklyMargin: (house, ws) => {
      const r = margin.get(`${house}|${ws}`);
      return r && (r.daysCount ?? 0) >= 7 ? r.value : null;
    },
    weeklyPosture: (house, ws) => {
      const r = post.get(`${house}|${ws}`);
      return { value: r?.value ?? null, ageWeek: r?.ageWeek ?? null, days: r?.daysCount ?? 0 };
    },
    forecast: ds.forecast.map((f) => ({ date: f.date, tempMax: f.tempMax })),
    coolingDelta: Object.fromEntries(ds.houses.map((h) => [h.code, h.coolingDelta])),
  };
}
