/** Candidatos a "casos parecidos" (Parte 11.5): eventos confirmados com impressão digital e alertas resolvidos com causa e útil = sim. */
import { addDays as addDaysLocal, ageWeeksDecimal, diffDays, productiveDate } from "@/lib/dates";
import type { EventRecord, Flock } from "@/engine/types";
import type { EventImpactResult } from "@/engine/impacts/impact";
import { EVENT_TYPE_BY_CODE } from "@/engine/impacts/event-types";
import { EVENT_TO_CAUSE, anomalyFingerprint, type CaseCandidate } from "./analyze";
import type { CauseContext } from "./signals";

export function eventCandidates(events: EventRecord[], impacts: Map<string, Pick<EventImpactResult, "fingerprints" | "rows">>, flocks: Map<string, Flock>): CaseCandidate[] {
  const out: CaseCandidate[] = [];
  const maxZ = (id: string, house: string) => Math.max(0, ...(impacts.get(id)?.fingerprints.find((f) => f.house === house)?.vector ?? []).map((v) => Math.abs(v ?? 0)));
  const effEnd = (e: EventRecord) => {
    const def = EVENT_TYPE_BY_CODE[e.typeCode];
    const dur = e.endDate ? diffDays(e.startDate, e.endDate) + 1 : 1;
    return addDaysLocal(e.startDate, (def?.effectPlusDuration ? dur + def.effectDays : (def?.effectDays ?? 7)) - 1);
  };
  for (const e of events) {
    const cause = EVENT_TO_CAUSE[e.typeCode];
    if (!cause || e.certainty !== "confirmado") continue;
    const imp = impacts.get(e.id);
    if (!imp) continue;
    const conf = e.certaintyHistory.find((c) => c.to === "confirmado")?.at ?? e.createdAt;
    for (const fp of imp.fingerprints) {
      // um caso sem impacto relevante não é parecido com nada
      if (!fp.vector.some((v) => v != null && Math.abs(v) >= 2)) continue;
      // evento confundido: outro evento confirmado no mesmo galpão, sobreposto e com impacto maior, explica os números
      const mine = maxZ(e.id, fp.house);
      const confounded = events.some((o) => o.id !== e.id && o.certainty === "confirmado" && o.houses.includes(fp.house) && o.startDate <= effEnd(e) && effEnd(o) >= e.startDate && maxZ(o.id, fp.house) > mine);
      if (confounded) continue;
      const code = e.flocks[fp.house];
      const f = code ? flocks.get(code) : undefined;
      const post = imp.rows.find((r) => r.house === fp.house && r.metric === "prod.postura" && !r.isControl);
      const def = EVENT_TYPE_BY_CODE[e.typeCode];
      out.push({
        kind: "evento",
        id: e.id,
        date: e.startDate,
        knownOn: productiveDate(new Date(conf)),
        house: fp.house,
        flock: code ?? null,
        ageWeek: f ? Math.floor(ageWeeksDecimal(e.startDate, f.hatchDate)) : null,
        cause,
        vector: fp.vector,
        recoveryDays: post?.recoveryDays ?? null,
        action: e.actionTaken,
        span: [e.startDate, e.endDate ?? e.startDate],
      });
      void def;
    }
  }
  return out;
}

export interface ResolvedAlertInfo {
  id: string;
  house: string;
  flock: string | null;
  firstDeviationOn: string;
  closedOn: string;
  cause: string;
  action: string | null;
}

export function alertCandidates(ctx: CauseContext, alerts: ResolvedAlertInfo[]): CaseCandidate[] {
  return alerts.map((a) => {
    const f = a.flock ? ctx.flocks.get(a.flock) : undefined;
    const vector = anomalyFingerprint(ctx, a.house, a.firstDeviationOn, a.closedOn);
    return {
      kind: "alerta" as const,
      id: a.id,
      date: a.firstDeviationOn,
      knownOn: a.closedOn,
      house: a.house,
      flock: a.flock,
      ageWeek: f ? Math.floor(ageWeeksDecimal(a.firstDeviationOn, f.hatchDate)) : null,
      cause: a.cause,
      vector,
      recoveryDays: diffDays(a.firstDeviationOn, a.closedOn),
      action: a.action,
      span: [a.firstDeviationOn, a.closedOn] as [string, string],
    };
  }).filter((c) => c.vector.some((v) => v != null && Math.abs(v) >= 2));
}
