import type { Dataset } from "../../src/engine/types";
import type { MetricsResult } from "../../src/engine/metrics/pipeline";
import { computeAllImpacts } from "../../src/engine/impacts/run";
import { analyzeAlert } from "../../src/engine/causes/analyze";
import { alertCandidates, eventCandidates } from "../../src/engine/causes/candidates";
import type { CauseContext } from "../../src/engine/causes/signals";
import { minDate } from "../../src/lib/dates";
import { demoStateFor } from "../../src/simulator/demo-states";
import { marginBridge, type WeekFinance } from "../../src/engine/finance/bridge";
import { addDays as add } from "../../src/lib/dates";
import type { AlertsWorld } from "./alerts-step";

export function causeContextFrom(ds: Dataset, m: MetricsResult): CauseContext {
  return { store: m.store, flocks: m.idx.flockByCode, strainStd: m.strainStd, events: ds.events, lab: m.idx.lab, feedBatches: ds.feedBatches };
}

/** Passo 9: hipóteses (na abertura e atuais), decomposição e casos parecidos de cada alerta. */
export async function computeAlertInsights(ds: Dataset, m: MetricsResult, w: AlertsWorld) {
  const ctx = causeContextFrom(ds, m);
  const exp = w.ctx.expected;
  const quick = (a: (typeof w.alerts)[number], d: string) => analyzeAlert(ctx, exp, { house: a.house!, anomalyType: a.anomalyType as never, a: a.firstDeviationOn, d });
  // estados de demonstração (o A11 sem cenário usa a hipótese de calor de maior nota)
  w.states = new Map(
    w.alerts.map((a) => [
      a.id,
      demoStateFor(a, w.scenarios, ds.dEnd, (x) => {
        const h = quick(x, x.openedOn).hypotheses.find((y) => y.code === "estresse_termico" || y.code === "resfriamento_insuficiente");
        return h?.code ?? "estresse_termico";
      }),
    ]),
  );
  // candidatos: eventos confirmados com impacto e alertas resolvidos úteis
  const impacts = computeAllImpacts(ds, m);
  const resolved = w.alerts
    .filter((a) => a.house && w.states!.get(a.id)?.status === "resolvido" && w.states!.get(a.id)?.wasUseful && w.states!.get(a.id)?.causeCode)
    .map((a) => ({ id: a.id, house: a.house!, flock: a.flock, firstDeviationOn: a.firstDeviationOn, closedOn: w.states!.get(a.id)!.closedOn ?? a.openedOn, cause: w.states!.get(a.id)!.causeCode!, action: w.states!.get(a.id)!.actionTaken }));
  const candidates = [...eventCandidates(ds.events, impacts, m.idx.flockByCode), ...alertCandidates(ctx, resolved)];
  w.hypotheses = new Map();
  let n = 0;
  for (const a of w.alerts) {
    if (!a.house || a.rule === "P01" || a.rule === "A22") continue;
    const st = w.states.get(a.id)!;
    const atOpen = analyzeAlert(ctx, exp, { house: a.house, anomalyType: a.anomalyType as never, a: a.firstDeviationOn, d: a.openedOn }, { candidates, alertId: a.id });
    // aberto: sinais e evidência de hoje; encerrado: sinais da abertura e evidência até o encerramento
    const isOpen = ["aberto", "reconhecido", "em_investigacao"].includes(st.status);
    const dSignals = isOpen ? ds.dEnd : a.openedOn;
    const dEvidence = isOpen ? ds.dEnd : minDate(st.closedOn ?? ds.dEnd, ds.dEnd);
    const now = analyzeAlert(ctx, exp, { house: a.house, anomalyType: a.anomalyType as never, a: a.firstDeviationOn, d: dSignals }, { candidates, alertId: a.id, evidenceDay: dEvidence });
    w.hypotheses.set(a.id, {
      hypotheses: now.hypotheses.slice(0, 5),
      decomposition: now.decomposition,
      similar: now.similar,
      atOpening: atOpen.hypotheses.slice(0, 5).map((h) => ({ code: h.code, name: h.name, score: h.score, confidence: h.confidence })),
      whatToKnow: now.whatToKnow,
      text: now.text,
      fingerprint: now.fingerprint,
    });
    n++;
  }
  // A22: ponte de margem no lugar das hipóteses (Parte 12.5)
  const wk = (house: string, ws: string): WeekFinance | null => {
    const g = (metric: string) => m.weekly.find((r) => r.house === house && r.key === ws && r.metric === metric);
    const mg = g("fin.margem");
    const eggs = g("prod.ovos");
    const feed = g("nut.racao");
    const price = ds.prices.find((p) => p.weekStart === ws);
    if (!mg || mg.value == null || !eggs?.value || !feed?.num || !price) return null;
    return { weekStart: ws, margin: mg.value, dozens: eggs.value / 12, eggPrice: price.ovo_comercial_dz, feedKg: feed.num / 1000, feedPrice: price.racao_kg };
  };
  for (const a of w.alerts.filter((x) => x.rule === "A22" && x.house)) {
    const cur = wk(a.house!, add(a.openedOn, -7));
    if (!cur) continue;
    let ref: WeekFinance | null = null;
    for (let k = 1; k <= 8 && !ref; k++) {
      const x = wk(a.house!, add(cur.weekStart, -7 * k));
      if (x && x.margin >= 0) ref = x;
    }
    ref = ref ?? wk(a.house!, add(cur.weekStart, -56));
    if (!ref) continue;
    const b = marginBridge(ref, cur);
    w.hypotheses.set(a.id, { hypotheses: [], decomposition: b, similar: [], atOpening: [], whatToKnow: [], text: b.sentence });
  }
  console.log(`\n    ${n} alertas analisados · ${candidates.length} casos candidatos (eventos confirmados e alertas resolvidos)`);
}
