import "server-only";
import { getSql } from "@/db/client";
import type { Scope } from "@/server/permissions";

const OPEN = ["aberto", "reconhecido", "em_investigacao"];

/** Alertas abertos visíveis ao usuário (galpões permitidos + alertas da granja; A22 só com financeiro). */
export async function countOpenAlerts(scope: Scope): Promise<number> {
  const sql = getSql();
  const ids = [...scope.houseIds];
  const [r] = await sql`select count(*)::int as n from app.alerts
    where status in ${sql(OPEN)} and (house_id is null or house_id in ${sql(ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])})
    and (${scope.canSeeFinance} or rule_code <> 'A22')`;
  return r?.n ?? 0;
}
