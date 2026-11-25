import "server-only";
/**
 * Recalcula hipóteses, decomposição e casos parecidos de um alerta com os dados do banco (Parte 11.4: sempre que chegar
 * evidência nova — evento, resposta do encarregado, novo dia).
 */
import { getSql } from "@/db/client";
import { addDays, maxDate, minDate, productiveDate } from "@/lib/dates";
import { analyzeAlert, EVENT_TO_CAUSE, type CaseCandidate } from "@/engine/causes/analyze";
import { questionFor } from "@/engine/alerts/questions";
import { StrainStandards } from "@/engine/standards/strain";
import type { Flock, LabSample } from "@/engine/types";
import { loadEvents, loadReferenceData, loadStrainStandards } from "@/server/repositories/dataset-loader";
import { loadMetricStore } from "@/server/repositories/metric-store-loader";
import { eventExclusion } from "@/engine/alerts/context";

const d10 = (v: unknown) => (v == null ? null : typeof v === "string" ? v.slice(0, 10) : (v as Date).toISOString().slice(0, 10));

export async function recomputeAlertInsights(alertId: string): Promise<void> {
  const sql = getSql();
  const [a] = await sql`select a.*, h.code as house from app.alerts a left join app.houses h on h.id = a.house_id where a.id = ${alertId}`;
  if (!a || !a.house || ["P01", "A22"].includes(a.rule_code)) return;
  const [{ d }] = await sql`select max(date) as d from app.daily_metrics`;
  const today = d10(d)!;
  const open = ["aberto", "reconhecido", "em_investigacao"].includes(a.status);
  const first = d10(a.first_deviation_on)!;
  const dSignals = open ? today : d10(a.opened_on)!;
  const dEvidence = open ? maxDate(today, productiveDate(new Date())) : minDate(d10(a.closed_on) ?? today, today);
  const ref = await loadReferenceData(sql);
  const houseCodeById = new Map<string, string>(ref.houses.map((h) => [h.id, h.code]));
  const flockCodeById = new Map<string, string>(ref.flocks.map((f) => [f.id, f.code]));
  const flocks = new Map<string, Flock>(
    ref.flocks.map((f) => [f.code, { id: f.id, code: f.code, strainCode: f.strain_code, houseCode: f.house_code, hatchDate: d10(f.hatch_date)!, birdsHoused: Number(f.birds_housed), chickCostBrl: Number(f.chick_cost_brl), plannedCullAgeWeeks: Number(f.planned_cull_age_weeks), status: f.status, qualityOffset: 0, startDate: d10(f.start_date)!, endDate: d10(f.end_date) }]),
  );
  const store = await loadMetricStore(sql, { from: addDays(first, -150), to: today });
  const events = await loadEvents(sql, houseCodeById, flockCodeById);
  const labRows = await sql`select * from app.lab_samples where date between ${addDays(first, -120)} and ${today} order by date`;
  const lab = new Map<string, LabSample[]>();
  for (const s of labRows) {
    const h = houseCodeById.get(s.house_id)!;
    const arr = lab.get(h) ?? [];
    arr.push({ id: s.id, house: h, flock: flockCodeById.get(s.flock_id)!, date: d10(s.date)!, n: Number(s.n_eggs), strength: s.strength_kgf == null ? null : Number(s.strength_kgf), thickness: null, gravity: s.specific_gravity == null ? null : Number(s.specific_gravity), haugh: null, eggWeight: null, yolkColor: null });
    lab.set(h, arr);
  }
  const batches = await sql`select * from app.feed_batches where delivered_on between ${addDays(first, -60)} and ${today}`;
  const feedBatches = batches.map((b) => ({ id: b.id, code: b.code, deliveredOn: d10(b.delivered_on)!, group: "", houses: (b.house_ids as string[]).map((x) => houseCodeById.get(x)!), pricePerKg: Number(b.price_per_kg), calciumSpec: Number(b.calcium_pct_spec), supplier: b.supplier, formulation: b.formulation }));
  const strainStd = new StrainStandards(await loadStrainStandards(sql));
  const ctx = { store, flocks, strainStd, events, lab, feedBatches };
  const exp = { store, strainStd, flocks, excluded: eventExclusion({ events }), betaCache: new Map<string, number>() };

  // candidatos: eventos confirmados com impressão digital e alertas resolvidos úteis (impressão guardada na evidência)
  const fps = await sql`select f.event_id, h.code as house, f.vector, (select recovery_days from app.event_impacts i where i.event_id = f.event_id and i.house_id = f.house_id and i.metric_code = 'prod.postura') as rec
    from app.event_fingerprints f join app.houses h on h.id = f.house_id`;
  const evById = new Map(events.map((e) => [e.id, e]));
  const candidates: CaseCandidate[] = [];
  for (const f of fps) {
    const e = evById.get(f.event_id);
    if (!e || e.certainty !== "confirmado" || !EVENT_TO_CAUSE[e.typeCode]) continue;
    const vector = (f.vector as number[]).map(Number);
    if (!vector.some((v) => Math.abs(v) >= 2)) continue;
    const conf = e.certaintyHistory.find((c) => c.to === "confirmado")?.at ?? e.createdAt;
    const fl = e.flocks[f.house];
    const fx = fl ? flocks.get(fl) : undefined;
    candidates.push({ kind: "evento", id: e.id, date: e.startDate, knownOn: conf.slice(0, 10), house: f.house, flock: fl ?? null, ageWeek: fx ? Math.floor((new Date(e.startDate).getTime() - new Date(fx.hatchDate).getTime()) / (7 * 86400000)) : null, cause: EVENT_TO_CAUSE[e.typeCode], vector, recoveryDays: f.rec == null ? null : Number(f.rec), action: e.actionTaken, span: [e.startDate, e.endDate ?? e.startDate] });
  }
  const resolved = await sql`select a.id, h.code as house, f.code as flock, a.first_deviation_on, a.closed_on, a.cause_code, a.action_taken, a.evidence->'fingerprint' as fp
    from app.alerts a join app.houses h on h.id = a.house_id left join app.flocks f on f.id = a.flock_id
    where a.status = 'resolvido' and a.was_useful and a.cause_code is not null and a.evidence ? 'fingerprint' and a.id <> ${alertId}`;
  for (const r of resolved) {
    const vector = ((r.fp as Array<number | null>) ?? []).map((v) => (v == null ? null : Number(v)));
    if (!vector.some((v) => v != null && Math.abs(v) >= 2)) continue;
    const fd = d10(r.first_deviation_on)!;
    const cd = d10(r.closed_on) ?? fd;
    candidates.push({ kind: "alerta", id: r.id, date: fd, knownOn: cd, house: r.house, flock: r.flock, ageWeek: null, cause: r.cause_code, vector, recoveryDays: Math.round((new Date(cd).getTime() - new Date(fd).getTime()) / 86400000), action: r.action_taken, span: [fd, cd] });
  }
  // resposta do encarregado
  const [q] = await sql`select answer_code from app.anomaly_questions where alert_id = ${alertId} and answered_at is not null order by answered_at desc limit 1`;
  const answerHyp = q ? (questionFor(a.anomaly_type, a.house)?.options.find((o) => o.code === q.answer_code)?.hypothesis ?? null) : null;

  const r = analyzeAlert(ctx, exp, { house: a.house, anomalyType: a.anomaly_type, a: first, d: dSignals }, { candidates, alertId, evidenceDay: dEvidence, answerHypothesis: answerHyp });
  const evidence = { ...(a.evidence ?? {}), what_to_know: r.whatToKnow, explanation: r.text, fingerprint: r.fingerprint, recomputed_at: new Date().toISOString() };
  if (!a.evidence?.hypotheses_at_opening) evidence.hypotheses_at_opening = r.hypotheses.slice(0, 5).map((h) => ({ code: h.code, name: h.name, score: h.score, confidence: h.confidence }));
  await sql`update app.alerts set hypotheses = ${JSON.stringify(r.hypotheses.slice(0, 5))}::jsonb, decomposition = ${r.decomposition ? JSON.stringify(r.decomposition) : null}::jsonb,
    similar_cases = ${JSON.stringify(r.similar)}::jsonb, evidence = ${JSON.stringify(evidence)}::jsonb where id = ${alertId}`;
}

/** Recalcula todos os alertas abertos (novo dia ou evento novo nos galpões indicados). */
export async function recomputeOpenAlertInsights(houses?: string[]) {
  const sql = getSql();
  const rows = await sql`select a.id from app.alerts a left join app.houses h on h.id = a.house_id where a.status in ('aberto','reconhecido','em_investigacao') and a.house_id is not null
    ${houses?.length ? sql`and h.code in ${sql(houses)}` : sql``}`;
  for (const r of rows) await recomputeAlertInsights(r.id);
  return rows.length;
}
