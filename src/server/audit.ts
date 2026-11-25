import "server-only";
import { getSql } from "@/db/client";
import { TENANT_ID } from "@/lib/ids";

/** Registra toda escrita em audit_log, com antes e depois (Parte 17.4). */
export async function audit(userId: string | null, action: string, entity: string, entityId: string | null, before: unknown, after: unknown) {
  const sql = getSql();
  await sql`insert into app.audit_log (tenant_id, user_id, action, entity, entity_id, before, after)
    values (${TENANT_ID}, ${userId}, ${action}, ${entity}, ${entityId}, ${before == null ? null : JSON.stringify(before)}::jsonb, ${after == null ? null : JSON.stringify(after)}::jsonb)`;
}
