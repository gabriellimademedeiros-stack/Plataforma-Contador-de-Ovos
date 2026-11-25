/**
 * Pontuação das hipóteses (Parte 11.4), casos parecidos (11.5), decomposição do desvio (11.6) e texto (11.7).
 */
import { addDays, ageWeeksDecimal, diffDays, productiveDate } from "@/lib/dates";
import { clampNum, cosineMasked, mean, robustSd } from "@/engine/stats";
import { FINGERPRINT_METRICS, SD_FLOOR } from "@/engine/impacts/impact";
import { heatBeta, hlag, type ExpectedContext } from "@/engine/standards/expected";
import { ANOMALY_APPLIES, HYPOTHESIS_BY_CODE, KNOWLEDGE_BASE, MISSING_QUESTIONS, type Hypothesis, type SignalCode } from "./knowledge-base";
import { computeSignals, type AnomalyRef, type CauseContext, type Signal } from "./signals";

export interface ScoredHypothesis {
  code: string;
  name: string;
  score: number;
  raw: number;
  confidence: "alta" | "media" | "baixa";
  confidenceReason: string;
  for: Array<{ signal: string; text: string; weight: number }>;
  against: Array<{ signal: string; text: string; weight: number }>;
  absent: Array<{ signal: string; text: string; weight: number }>;
  unverifiable: Array<{ signal: string; text: string }>;
  bonus: Array<{ signal: string; text: string; points: number }>;
  checks: string[];
  confirmed: boolean;
}

export interface SimilarCase {
  kind: "evento" | "alerta";
  id: string;
  date: string;
  house: string;
  flock: string | null;
  ageWeek: number | null;
  cause: string;
  similarity: number;
  recoveryDays: number | null;
  action: string | null;
  link: string;
}

export interface CaseCandidate {
  kind: "evento" | "alerta";
  id: string;
  date: string;
  /** dia em que o caso passou a existir (criação do evento ou resolução do alerta) */
  knownOn: string;
  house: string;
  flock: string | null;
  ageWeek: number | null;
  cause: string;
  vector: (number | null)[];
  recoveryDays: number | null;
  action: string | null;
  span: [string, string];
}

/** Tipo de evento → hipótese correspondente (EVENTO_CONFIRMADO e casos parecidos). */
export const EVENT_TO_CAUSE: Record<string, string> = Object.fromEntries(KNOWLEDGE_BASE.flatMap((h) => h.confirmingEvents.map((t) => [t, h.code])));

export interface ScoreExtras {
  answerHypothesis?: string | null;
  similar?: SimilarCase[];
}

export function scoreHypotheses(ctx: CauseContext, ref: AnomalyRef, signals: Record<SignalCode, Signal>, extras: ScoreExtras = {}): ScoredHypothesis[] {
  const cat = ANOMALY_APPLIES[ref.anomalyType];
  if (!cat) return [];
  const evs = ctx.events.filter((e) => e.houses.includes(ref.house) && e.certainty === "confirmado" && e.startDate >= addDays(ref.a, -10) && e.startDate <= ref.d && productiveDate(new Date(lastConfirmation(e))) <= ref.d);
  const out: ScoredHypothesis[] = [];
  for (const h of KNOWLEDGE_BASE.filter((x) => x.appliesTo.includes(cat))) {
    out.push(scoreOne(h, signals, evs, extras));
  }
  out.sort((x, y) => y.score - x.score || y.raw - x.raw || Number(y.confirmed) - Number(x.confirmed));
  return out;
}

function lastConfirmation(e: { certaintyHistory: Array<{ at: string; to: string }>; createdAt: string }): string {
  const c = e.certaintyHistory.find((x) => x.to === "confirmado");
  return c?.at ?? e.createdAt;
}

function scoreOne(h: Hypothesis, sig: Record<SignalCode, Signal>, confirmedEvents: Array<{ typeCode: string; title: string; startDate: string }>, extras: ScoreExtras): ScoredHypothesis {
  let raw = 0;
  let max = 0;
  let min = 0;
  const pro: ScoredHypothesis["for"] = [];
  const con: ScoredHypothesis["against"] = [];
  const absent: ScoredHypothesis["absent"] = [];
  const unv: ScoredHypothesis["unverifiable"] = [];
  for (const [code, w] of Object.entries(h.favor) as Array<[SignalCode, number]>) {
    const s = sig[code];
    if (!s || s.state === "nao_verificavel") {
      unv.push({ signal: code, text: s?.text ?? code });
      continue;
    }
    max += w;
    min -= 0.5 * w;
    if (s.state === "presente") {
      raw += w;
      pro.push({ signal: code, text: s.text, weight: w });
    } else {
      raw -= 0.5 * w;
      absent.push({ signal: code, text: s.text, weight: w });
    }
  }
  for (const [code, w] of Object.entries(h.against) as Array<[SignalCode, number]>) {
    const s = sig[code];
    if (!s || s.state === "nao_verificavel") continue;
    min -= w;
    if (s.state === "presente") {
      raw -= w;
      con.push({ signal: code, text: s.text, weight: w });
    }
  }
  for (const [code, w] of Object.entries(h.orderBonus ?? {}) as Array<[SignalCode, number]>) {
    const s = sig[code];
    if (!s || s.state === "nao_verificavel") continue;
    max += w;
    if (s.state === "presente") {
      raw += w;
      pro.push({ signal: code, text: s.text, weight: w });
    }
  }
  const bonus: ScoredHypothesis["bonus"] = [];
  const ev = confirmedEvents.find((e) => EVENT_TO_CAUSE[e.typeCode] === h.code);
  if (ev) bonus.push({ signal: "EVENTO_CONFIRMADO", text: `evento confirmado: ${ev.title} (${ev.startDate.slice(8, 10)}/${ev.startDate.slice(5, 7)})`, points: 4 });
  if (extras.answerHypothesis && extras.answerHypothesis === h.code) bonus.push({ signal: "RESPOSTA_ENCARREGADO", text: "o encarregado respondeu apontando para esta causa", points: 4 });
  const sim = (extras.similar ?? []).filter((c) => c.cause === h.code && c.similarity >= 0.6).sort((a, b) => b.similarity - a.similarity)[0];
  if (sim) bonus.push({ signal: "CASO_PARECIDO", text: `caso parecido: ${sim.house} em ${sim.date.slice(8, 10)}/${sim.date.slice(5, 7)}/${sim.date.slice(0, 4)} (${Math.round(sim.similarity * 100)}% de semelhança)`, points: 3 * sim.similarity });
  const span = max - min || 1;
  const bonusPts = bonus.reduce((a, b) => a + b.points, 0);
  const score = clampNum((100 * (raw - min)) / span + (bonusPts * 100) / span, 0, 100);
  const confirmed = !!ev || bonus.some((b) => b.signal === "RESPOSTA_ENCARREGADO") || (sim != null && sim.similarity >= 0.7);
  let confidence: ScoredHypothesis["confidence"] = score >= 70 && confirmed ? "alta" : score >= 45 ? "media" : "baixa";
  const reason = score >= 70 && !confirmed ? "sem confirmação humana, no máximo média" : confidence === "alta" ? "nota alta com confirmação" : "";
  if (score >= 70 && !confirmed) confidence = "media";
  return { code: h.code, name: h.name, score, raw, confidence, confidenceReason: reason, for: pro, against: con, absent, unverifiable: unv, bonus, checks: h.checks, confirmed };
}

// --------------------------------------------------------------------------------------------
// Casos parecidos
// --------------------------------------------------------------------------------------------

/** Impressão digital da anomalia atual: base a−14…a−1, efeito a…min(a+13, d). */
export function anomalyFingerprint(ctx: CauseContext, house: string, a: string, d: string): (number | null)[] {
  const end = addDays(a, 13) < d ? addDays(a, 13) : d;
  return FINGERPRINT_METRICS.map((m) => {
    const base: number[] = [];
    for (let x = addDays(a, -14); x <= addDays(a, -1); x = addDays(x, 1)) {
      const v = ctx.store.getValid(house, m, x);
      if (v != null) base.push(v);
    }
    const eff: number[] = [];
    for (let x = a; x <= end; x = addDays(x, 1)) {
      const v = ctx.store.getValid(house, m, x);
      if (v != null) eff.push(v);
    }
    if (base.length < 3 || !eff.length) return null;
    const sd = robustSd(base, SD_FLOOR[m] ?? 0)!;
    return sd > 0 ? clampNum((mean(eff)! - mean(base)!) / sd, -6, 6) : null;
  });
}

export function findSimilar(vector: (number | null)[], candidates: CaseCandidate[], opts: { house: string; a: string; d: string; excludeId?: string; limit?: number }): SimilarCase[] {
  const scored: SimilarCase[] = [];
  for (const c of candidates) {
    if (c.id === opts.excludeId) continue;
    if (c.knownOn > opts.d || c.date > opts.d) continue;
    if (c.house === opts.house && c.span[0] <= addDays(opts.a, 14) && c.span[1] >= addDays(opts.a, -14)) continue;
    // casos simultâneos (mesmo período, qualquer galpão) não são memória: fazem parte do mesmo episódio
    if (c.span[0] <= opts.d && c.span[1] >= addDays(opts.a, -14)) continue;
    const sim = cosineMasked(vector, c.vector);
    if (sim == null || sim < 0.6) continue;
    scored.push({ kind: c.kind, id: c.id, date: c.date, house: c.house, flock: c.flock, ageWeek: c.ageWeek, cause: c.cause, similarity: sim, recoveryDays: c.recoveryDays, action: c.action, link: c.kind === "evento" ? `/eventos/${c.id}` : `/alertas/${c.id}` });
  }
  scored.sort((x, y) => y.similarity - x.similarity);
  // um caso por (galpão, causa, semana) — evento e alertas do mesmo episódio contam uma vez
  const seen = new Set<string>();
  const out: SimilarCase[] = [];
  for (const s of scored) {
    const k = `${s.house}|${s.cause}|${s.date.slice(0, 7)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
    if (out.length >= (opts.limit ?? 3)) break;
  }
  return out;
}

// --------------------------------------------------------------------------------------------
// Decomposição do desvio (anomalias de postura)
// --------------------------------------------------------------------------------------------

export interface Decomposition {
  kind: "postura";
  base: number;
  total: number;
  idade: number;
  calor: number;
  resto: number;
  atual: number;
  beta: number;
  steps: Array<{ label: string; value: number }>;
  sentence: string;
  unit: string;
}

export function decompose(ctx: CauseContext, exp: ExpectedContext, house: string, a: string, d: string): Decomposition | null {
  const code = ctx.store.flockAt(house, a);
  const f = code ? ctx.flocks.get(code) : undefined;
  if (!f) return null;
  const range = (from: string, to: string) => {
    const xs: string[] = [];
    for (let x = from; x <= to; x = addDays(x, 1)) xs.push(x);
    return xs;
  };
  const baseDays = range(addDays(a, -10), addDays(a, -3));
  const effDays = range(a, d);
  const post = (ds: string[]) => mean(ds.map((x) => ctx.store.getValid(house, "prod.postura", x)));
  const std = (ds: string[]) => mean(ds.map((x) => ctx.strainStd.at(f.strainCode, "prod.postura", ageWeeksDecimal(x, f.hatchDate))));
  const hl = (ds: string[]) => mean(ds.map((x) => hlag(ctx.store, house, x)));
  const pb = post(baseDays);
  const pe = post(effDays);
  if (pb == null || pe == null) return null;
  const beta = heatBeta(exp, house);
  const total = pe - pb;
  const idade = (std(effDays) ?? 0) - (std(baseDays) ?? 0);
  const calor = -beta * ((hl(effDays) ?? 0) - (hl(baseDays) ?? 0));
  const resto = total - idade - calor;
  const n = (v: number) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v);
  let sentence = `Idade explica ${n(idade)} p.p., calor explica ${n(calor)} p.p.; sobram ${n(resto)} p.p. sem explicação.`;
  if (Math.abs(resto) <= 1.0 && total !== 0 && calor / total >= 0.6) sentence += " A queda é explicada pelo calor e pela idade.";
  return {
    kind: "postura",
    base: pb,
    total,
    idade,
    calor,
    resto,
    atual: pe,
    beta,
    unit: "%",
    steps: [
      { label: "Base", value: pb },
      { label: "Idade", value: idade },
      { label: "Calor", value: calor },
      { label: "Sem explicação", value: resto },
      { label: "Atual", value: pe },
    ],
    sentence,
  };
}

// --------------------------------------------------------------------------------------------
// Texto determinístico e "o que falta saber"
// --------------------------------------------------------------------------------------------

export function whatToKnow(hyps: ScoredHypothesis[]): string[] {
  const qs: string[] = [];
  for (const h of hyps.slice(0, 3)) for (const u of h.unverifiable) {
    const q = MISSING_QUESTIONS[u.signal as SignalCode];
    if (q && !qs.includes(q)) qs.push(q);
  }
  return qs;
}

export function explanationText(hyps: ScoredHypothesis[], dec: Decomposition | null, similar: SimilarCase[]): string {
  const h = hyps[0];
  if (!h) return "Sem hipóteses aplicáveis a este tipo de alerta.";
  const conf = h.confidence === "alta" ? "alta" : h.confidence === "media" ? "média" : "baixa";
  const pro = [...h.bonus.map((b) => b.text), ...h.for.map((f) => f.text)].slice(0, 4).join("; ") || "nenhum sinal forte";
  const con = h.against.map((c) => c.text).slice(0, 3).join("; ") || "nenhuma evidência contra";
  const checks = h.checks.slice(0, 3).join(", ");
  const cases = similar.length ? `Casos parecidos: ${similar.map((s) => `${s.house} em ${s.date.slice(8, 10)}/${s.date.slice(5, 7)}/${s.date.slice(0, 4)} (${HYPOTHESIS_BY_CODE[s.cause]?.name ?? s.cause}, ${Math.round(s.similarity * 100)}%)`).join("; ")}${similar.length < 3 ? " — poucos casos: trate como indício, não como padrão" : ""}.` : "Sem casos parecidos com semelhança suficiente.";
  return `Hipótese principal: ${h.name} (confiança ${conf}). A favor: ${pro}. Contra: ${con}. Verifique primeiro: ${checks}. ${dec ? dec.sentence + " " : ""}${cases} Isto é uma hipótese, não um diagnóstico.`;
}

export interface AlertAnalysis {
  hypotheses: ScoredHypothesis[];
  signals: Record<SignalCode, Signal>;
  decomposition: Decomposition | null;
  similar: SimilarCase[];
  whatToKnow: string[];
  text: string;
  fingerprint: (number | null)[];
}

/**
 * Análise completa de um alerta. Os sinais são avaliados no dia `ref.d` (abertura, ou hoje para alertas abertos);
 * a evidência que chega depois (eventos, resposta do encarregado, casos parecidos) vale até `evidenceDay`.
 */
export function analyzeAlert(
  ctx: CauseContext,
  exp: ExpectedContext,
  ref: AnomalyRef,
  opts: { candidates?: CaseCandidate[]; answerHypothesis?: string | null; alertId?: string; evidenceDay?: string; minEffectDays?: number } = {},
): AlertAnalysis {
  const ev = opts.evidenceDay && opts.evidenceDay > ref.d ? opts.evidenceDay : ref.d;
  const signals = computeSignals(ctx, { ...ref, knownUntil: ev });
  const fingerprint = anomalyFingerprint(ctx, ref.house, ref.a, ev);
  const effDays = diffDays(ref.a, ev) + 1;
  const similar = opts.candidates && effDays >= (opts.minEffectDays ?? 3) ? findSimilar(fingerprint, opts.candidates, { house: ref.house, a: ref.a, d: ev, excludeId: opts.alertId }) : [];
  const hypotheses = scoreHypotheses(ctx, { ...ref, d: ev }, signals, { answerHypothesis: opts.answerHypothesis, similar });
  const decomposition = ref.anomalyType === "postura_queda" ? decompose(ctx, exp, ref.house, ref.a, ref.d) : null;
  return { hypotheses, signals, decomposition, similar, whatToKnow: whatToKnow(hypotheses), text: explanationText(hypotheses, decomposition, similar), fingerprint };
}

export { diffDays };
