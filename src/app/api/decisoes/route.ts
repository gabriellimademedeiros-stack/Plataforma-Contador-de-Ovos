import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@/db/client";
import { withScope } from "@/server/api";
import { audit } from "@/server/audit";
import { weekStart } from "@/lib/dates";

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data inválida");
const Body = z.object({ weekStart: Day, text: z.string().trim().min(3, "escreva a decisão").max(500), ownerName: z.string().trim().max(120).nullish(), dueDate: Day.nullish() });

/** Decisões da reunião semanal (Parte 15.4). */
export const GET = withScope(async (_scope, req: Request) => {
  const w = new URL(req.url).searchParams.get("semana");
  const sql = getSql();
  const rows = await sql`select id, week_start::text as week_start, text, owner_name, due_date::text as due_date, status, created_at from app.decisions ${w ? sql`where week_start = ${weekStart(w)}` : sql``} order by week_start desc, created_at`;
  return NextResponse.json({ decisions: rows });
});

export const POST = withScope(async (scope, req: Request) => {
  if (!scope.canEditDecisions) return NextResponse.json({ error: "Seu perfil não registra decisões." }, { status: 403 });
  const b = Body.parse(await req.json());
  const sql = getSql();
  const [row] = await sql`insert into app.decisions (tenant_id, week_start, text, owner_name, due_date, status, created_by)
    select tenant_id, ${weekStart(b.weekStart)}, ${b.text}, ${b.ownerName ?? null}, ${b.dueDate ?? null}, 'aberta', ${scope.user.id} from app.farms limit 1
    returning id, week_start::text as week_start, text, owner_name, due_date::text as due_date, status, created_at`;
  await audit(scope.user.id, "criar", "decisions", row.id, null, b);
  return NextResponse.json({ ok: true, decision: row });
});
