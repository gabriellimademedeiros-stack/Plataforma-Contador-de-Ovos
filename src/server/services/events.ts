import "server-only";
import { z } from "zod";
import { getSql } from "@/db/client";
import { addDays, farmInstant, productiveDate } from "@/lib/dates";
import { TENANT_ID } from "@/lib/ids";
import { EVENT_TYPE_BY_CODE } from "@/engine/impacts/event-types";
import { computeEventImpact, eggPriceLookup, eventWindows } from "@/engine/impacts/impact";
import { StrainStandards } from "@/engine/standards/strain";
import type { EventRecord, Flock } from "@/engine/types";
import { assertHouse, PermissionError, type Scope } from "@/server/permissions";
import { audit } from "@/server/audit";
import { loadEvents, loadReferenceData, loadStrainStandards } from "@/server/repositories/dataset-loader";
import { loadMetricStore } from "@/server/repositories/metric-store-loader";
import { saveEventImpact } from "@/server/repositories/impact-writer";

const LocalDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/, "data/hora no formato AAAA-MM-DDTHH:mm");

export const EventInput = z.object({
  typeCode: z.string().refine((c) => !!EVENT_TYPE_BY_CODE[c], "tipo de evento desconhecido"),
  houses: z.array(z.string().regex(/^P\d{3}$/)).min(1, "escolha pelo menos um galpão"),
  title: z.string().trim().min(2, "informe um título").max(160),
  startsAt: LocalDateTime,
  endsAt: LocalDateTime.nullish(),
  severity: z.enum(["baixa", "media", "alta", "critica"]).default("media"),
  certainty: z.enum(["suspeito", "provavel", "confirmado", "descartado"]).default("suspeito"),
  confirmedBy: z.enum(["clinica", "laboratorio", "necropsia"]).nullish(),
  description: z.string().max(4000).nullish(),
  details: z.record(z.string(), z.unknown()).default({}),
  actionTaken: z.string().max(1000).nullish(),
  costBrl: z.number().min(0).max(10_000_000).nullish(),
  source: z.enum(["usuario", "assistente", "plataforma"]).default("usuario"),
});
export type EventInputT = z.infer<typeof EventInput>;

function toInstant(local: string): string {
  const [d, t] = local.split("T");
  const [h, m] = (t ?? "07:00").split(":").map(Number);
  return farmInstant(d, h, m).toISOString();
}

function sanitizeDetails(typeCode: string, details: Record<string, unknown>) {
  const def = EVENT_TYPE_BY_CODE[typeCode];
  const allowed = new Set(def.fields.map((f) => f.key));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(details)) if (allowed.has(k) && v !== "" && v != null) out[k] = v;
  // medicação: ovos liberados a partir de (início + carência)
  return out;
}

export async function createEvent(scope: Scope, input: EventInputT) {
  for (const h of input.houses) assertHouse(scope, h);
  const sql = getSql();
  const startsAt = toInstant(input.startsAt);
  const endsAt = input.endsAt ? toInstant(input.endsAt) : null;
  if (endsAt && endsAt < startsAt) throw new PermissionError("A data de fim não pode ser anterior ao início.");
  const startDate = productiveDate(new Date(startsAt));
  const details = sanitizeDetails(input.typeCode, input.details);
  const completeness = input.description || Object.keys(details).length || EVENT_TYPE_BY_CODE[input.typeCode].fields.length === 0 ? "completo" : "incompleto";
  const id = await sql.begin(async (tx) => {
    const [ev] = await tx`insert into app.events (tenant_id, type_code, title, starts_at, ends_at, severity, certainty, confirmed_by, description, details, action_taken, cost_brl, source, created_by, completeness)
      values (${TENANT_ID}, ${input.typeCode}, ${input.title}, ${startsAt}, ${endsAt}, ${input.severity}, ${input.certainty}, ${input.confirmedBy ?? null}, ${input.description ?? null},
        ${JSON.stringify(details)}::jsonb, ${input.actionTaken ?? null}, ${input.costBrl ?? null}, ${input.source}, ${scope.user.id}, ${completeness}) returning id`;
    for (const h of input.houses) {
      await tx`insert into app.event_scopes (event_id, house_id, flock_id)
        select ${ev.id}, h.id, (select p.flock_id from app.flock_placements p where p.house_id = h.id and p.start_date <= ${startDate} and (p.end_date is null or p.end_date >= ${startDate}) limit 1)
        from app.houses h where h.code = ${h}`;
    }
    await tx`insert into app.event_certainty_history (event_id, from_certainty, to_certainty, by_user, note) values (${ev.id}, null, ${input.certainty}, ${scope.user.id}, 'registro inicial')`;
    return ev.id as string;
  });
  await audit(scope.user.id, "criar", "events", id, null, { ...input, startsAt, endsAt });
  await recomputeEventImpact(id);
  return id;
}

export const EventPatch = EventInput.partial().omit({ source: true });

export async function updateEvent(scope: Scope, id: string, patch: z.infer<typeof EventPatch>) {
  const sql = getSql();
  const [before] = await sql`select e.*, array_agg(h.code) as houses from app.events e join app.event_scopes s on s.event_id = e.id join app.houses h on h.id = s.house_id where e.id = ${id} group by e.id`;
  if (!before) throw new PermissionError("Evento não encontrado.");
  for (const h of before.houses as string[]) assertHouse(scope, h);
  if (patch.houses) for (const h of patch.houses) assertHouse(scope, h);
  const startsAt = patch.startsAt ? toInstant(patch.startsAt) : new Date(before.starts_at).toISOString();
  const endsAt = patch.endsAt === undefined ? (before.ends_at ? new Date(before.ends_at).toISOString() : null) : patch.endsAt ? toInstant(patch.endsAt) : null;
  const typeCode = patch.typeCode ?? before.type_code;
  const details = patch.details ? { ...(before.details ?? {}), ...sanitizeDetails(typeCode, patch.details) } : before.details;
  await sql`update app.events set type_code = ${typeCode}, title = ${patch.title ?? before.title}, starts_at = ${startsAt}, ends_at = ${endsAt},
    severity = ${patch.severity ?? before.severity}, description = ${patch.description === undefined ? before.description : (patch.description ?? null)},
    details = ${JSON.stringify(details ?? {})}::jsonb, action_taken = ${patch.actionTaken === undefined ? before.action_taken : (patch.actionTaken ?? null)},
    cost_brl = ${patch.costBrl === undefined ? before.cost_brl : (patch.costBrl ?? null)} where id = ${id}`;
  if (patch.houses) {
    const startDate = productiveDate(new Date(startsAt));
    await sql`delete from app.event_scopes where event_id = ${id}`;
    for (const h of patch.houses)
      await sql`insert into app.event_scopes (event_id, house_id, flock_id) select ${id}, h.id, (select p.flock_id from app.flock_placements p where p.house_id = h.id and p.start_date <= ${startDate} and (p.end_date is null or p.end_date >= ${startDate}) limit 1) from app.houses h where h.code = ${h}`;
  }
  if (patch.certainty && patch.certainty !== before.certainty) await changeCertainty(scope, id, patch.certainty, patch.confirmedBy ?? null, "alterado na edição", false);
  await audit(scope.user.id, "editar", "events", id, before, patch);
  await recomputeEventImpact(id);
}

export async function changeCertainty(scope: Scope, id: string, to: string, confirmedBy: string | null, note: string | null, recompute = true) {
  const sql = getSql();
  const [ev] = await sql`select e.certainty, array_agg(h.code) as houses from app.events e join app.event_scopes s on s.event_id = e.id join app.houses h on h.id = s.house_id where e.id = ${id} group by e.id`;
  if (!ev) throw new PermissionError("Evento não encontrado.");
  for (const h of ev.houses as string[]) assertHouse(scope, h);
  await sql`update app.events set certainty = ${to}, confirmed_by = ${to === "confirmado" ? confirmedBy : null} where id = ${id}`;
  await sql`insert into app.event_certainty_history (event_id, from_certainty, to_certainty, by_user, note) values (${id}, ${ev.certainty}, ${to}, ${scope.user.id}, ${note})`;
  await audit(scope.user.id, "mudar_certeza", "events", id, { certainty: ev.certainty }, { certainty: to, confirmedBy, note });
  if (recompute) await recomputeEventImpact(id);
}

/** Recalcula o retrato de um evento a partir de daily_metrics (Parte 9.6). */
export async function recomputeEventImpact(eventId: string) {
  const sql = getSql();
  const ref = await loadReferenceData(sql);
  const houseCodeById = new Map<string, string>(ref.houses.map((h) => [h.id, h.code]));
  const flockCodeById = new Map<string, string>(ref.flocks.map((f) => [f.id, f.code]));
  const events = await loadEvents(sql, houseCodeById, flockCodeById);
  const e = events.find((x) => x.id === eventId);
  if (!e) return null;
  const [{ d }] = await sql`select max(date) as d from app.daily_metrics`;
  const today = (typeof d === "string" ? d : (d as Date).toISOString()).slice(0, 10);
  const w = eventWindows(e, today);
  if (!w) return null;
  const store = await loadMetricStore(sql, { from: addDays(w.baseFrom, -2), to: today < addDays(e.startDate, w.effectDays + w.recoveryDays) ? today : addDays(e.startDate, w.effectDays + w.recoveryDays) });
  const flocks = new Map<string, Flock>(
    ref.flocks.map((f) => [f.code, { id: f.id, code: f.code, strainCode: f.strain_code, houseCode: f.house_code, hatchDate: d10(f.hatch_date), birdsHoused: Number(f.birds_housed), chickCostBrl: Number(f.chick_cost_brl), plannedCullAgeWeeks: Number(f.planned_cull_age_weeks), status: f.status, qualityOffset: 0, startDate: d10(f.start_date), endDate: f.end_date ? d10(f.end_date) : null }]),
  );
  const prices = await sql`select week_start, value_brl from app.prices where item = 'ovo_comercial_dz'`;
  const strainStd = new StrainStandards(await loadStrainStandards(sql));
  const r = computeEventImpact({ store, flocks, strainStd, eggPrice: eggPriceLookup(new Map(prices.map((p) => [d10(p.week_start), Number(p.value_brl)]))), today }, e, EVENT_TYPE_BY_CODE[e.typeCode]?.name ?? e.typeCode);
  await saveEventImpact(sql, eventId, r);
  return r;
}

const d10 = (v: unknown) => (typeof v === "string" ? v.slice(0, 10) : (v as Date).toISOString().slice(0, 10));

/** Recalcula todos os retratos com janela aberta (avanço diário e dados novos). */
export async function recomputeOpenImpacts(houses?: string[]) {
  const sql = getSql();
  const rows = await sql`select distinct e.id from app.events e join app.event_impacts i on i.event_id = e.id join app.houses h on h.id = i.house_id
    where i.window_closed = false ${houses?.length ? sql`and h.code in ${sql(houses)}` : sql``}`;
  for (const r of rows) await recomputeEventImpact(r.id);
  return rows.length;
}

export type { EventRecord };
