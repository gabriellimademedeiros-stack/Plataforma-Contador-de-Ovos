import "server-only";
import { z } from "zod";
import { getSql } from "@/db/client";
import { addDays, farmToday } from "@/lib/dates";
import { TENANT_ID, houseIdFor } from "@/lib/ids";
import { HYPOTHESIS_CODES } from "@/engine/causes/codes";
import { questionFor } from "@/engine/alerts/questions";
import { PermissionError, type Scope } from "@/server/permissions";
import { audit } from "@/server/audit";
import { getRefDate } from "@/server/repositories/reference";
import { createEvent } from "./events";
import { recomputeAlertInsights } from "./alert-insights";

export const AlertAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reconhecer") }),
  z.object({ action: z.literal("investigar"), note: z.string().max(2000).nullish() }),
  z.object({
    action: z.literal("resolver"),
    causeCode: z.string().refine((c) => [...HYPOTHESIS_CODES, "variacao_normal", "desconhecida", "outra"].includes(c), "causa inválida"),
    causeNote: z.string().max(2000).nullish(),
    actionTaken: z.string().max(1000).nullish(),
    wasUseful: z.boolean({ error: "responda se o alerta foi útil" }),
    acceptDays: z.number().int().min(1).max(180).nullish(),
  }),
  z.object({ action: z.literal("descartar"), reason: z.string().trim().min(3, "informe o motivo").max(1000) }),
]);

export async function getAlertRow(id: string) {
  const sql = getSql();
  const [a] = await sql`select a.*, h.code as house from app.alerts a left join app.houses h on h.id = a.house_id where a.id = ${id}`;
  return a ?? null;
}

export function assertAlertAccess(scope: Scope, a: { house: string | null; rule_code: string }) {
  if (a.house && !scope.houseCodes.has(a.house)) throw new PermissionError(`Sem acesso a ${a.house}.`);
  if (a.rule_code === "A22" && !scope.canSeeFinance) throw new PermissionError("O perfil encarregado não tem acesso aos dados financeiros.");
}

export async function applyAlertAction(scope: Scope, id: string, input: z.infer<typeof AlertAction>) {
  const sql = getSql();
  const a = await getAlertRow(id);
  if (!a) throw new PermissionError("Alerta não encontrado.");
  assertAlertAccess(scope, a as unknown as { house: string | null; rule_code: string });
  const today = await getRefDate();
  const before = { status: a.status, cause_code: a.cause_code };
  switch (input.action) {
    case "reconhecer":
      if (!scope.canAckAlerts) throw new PermissionError();
      await sql`update app.alerts set status = case when status = 'aberto' then 'reconhecido' else status end, ack_by = coalesce(ack_by, ${scope.user.id}), ack_at = coalesce(ack_at, now()) where id = ${id}`;
      break;
    case "investigar":
      if (!scope.canResolveAlerts) throw new PermissionError("Só diretor e gerente movem o alerta para investigação.");
      await sql`update app.alerts set status = 'em_investigacao', ack_by = coalesce(ack_by, ${scope.user.id}), ack_at = coalesce(ack_at, now()), cause_note = coalesce(${input.note ?? null}, cause_note) where id = ${id}`;
      break;
    case "resolver":
      if (!scope.canResolveAlerts) throw new PermissionError("O encarregado não pode resolver alertas.");
      await sql`update app.alerts set status = 'resolvido', closed_on = ${today}, resolved_by = ${scope.user.id}, resolved_at = now(),
        cause_code = ${input.causeCode}, cause_note = ${input.causeNote ?? null}, action_taken = ${input.actionTaken ?? null}, was_useful = ${input.wasUseful},
        silenced_until = ${input.acceptDays ? addDays(today, input.acceptDays) : null}, ack_by = coalesce(ack_by, ${scope.user.id}), ack_at = coalesce(ack_at, now()) where id = ${id}`;
      break;
    case "descartar":
      if (!scope.canResolveAlerts) throw new PermissionError("O encarregado não pode descartar alertas.");
      await sql`update app.alerts set status = 'descartado', closed_on = ${today}, resolved_by = ${scope.user.id}, resolved_at = now(), discard_reason = ${input.reason}, was_useful = false where id = ${id}`;
      break;
  }
  await audit(scope.user.id, input.action, "alerts", id, before, input);
  void farmToday;
}

/** Resposta do encarregado à pergunta da plataforma (Parte 9.7). */
export async function answerQuestion(scope: Scope, questionId: string, answerCode: string, answerText?: string | null) {
  const sql = getSql();
  const [q] = await sql`select q.*, h.code as house, a.anomaly_type, a.first_deviation_on from app.anomaly_questions q join app.houses h on h.id = q.house_id join app.alerts a on a.id = q.alert_id where q.id = ${questionId}`;
  if (!q) throw new PermissionError("Pergunta não encontrada.");
  if (!scope.houseCodes.has(q.house)) throw new PermissionError(`Sem acesso a ${q.house}.`);
  if (q.answered_at) throw new PermissionError("Esta pergunta já foi respondida.");
  const def = questionFor(q.anomaly_type, q.house);
  const opt = def?.options.find((o) => o.code === answerCode);
  if (!opt) throw new PermissionError("Resposta inválida.");
  let eventId: string | null = null;
  if (opt.eventType) {
    const today = await getRefDate();
    const first = typeof q.first_deviation_on === "string" ? q.first_deviation_on : (q.first_deviation_on as Date).toISOString().slice(0, 10);
    eventId = await createEvent(scope, {
      typeCode: opt.eventType,
      houses: [q.house],
      title: `${opt.label} (resposta à pergunta da plataforma)`,
      startsAt: `${first}T06:00`,
      endsAt: null,
      severity: "media",
      certainty: "provavel",
      description: `Resposta do encarregado: "${opt.label}". ${answerText ?? ""}`.trim(),
      details: {},
      source: "plataforma",
      confirmedBy: null,
      actionTaken: null,
      costBrl: null,
    });
    await sql`insert into app.event_links (event_id, alert_id) values (${eventId}, ${q.alert_id}) on conflict do nothing`;
    void today;
  }
  await sql`update app.anomaly_questions set answered_by = ${scope.user.id}, answer_code = ${answerCode}, answer_text = ${answerText ?? null}, answered_at = now(), event_id = ${eventId} where id = ${questionId}`;
  await sql`insert into app.notifications (tenant_id, user_id, alert_id, house_id, kind, title, body, link)
    values (${TENANT_ID}, null, ${q.alert_id}, ${houseIdFor(q.house)}, 'resposta', ${`Encarregado respondeu sobre o ${q.house}: ${opt.label}`}, 'As hipóteses do alerta foram recalculadas.', ${`/alertas/${q.alert_id}`})`;
  await audit(scope.user.id, "responder", "anomaly_questions", questionId, null, { answerCode, answerText });
  // a resposta entra como sinal forte da hipótese correspondente
  await recomputeAlertInsights(q.alert_id);
}
