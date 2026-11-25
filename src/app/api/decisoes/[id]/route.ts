import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@/db/client";
import { withScope } from "@/server/api";
import { audit } from "@/server/audit";

const Body = z.object({
  status: z.enum(["aberta", "concluida", "cancelada"]).optional(),
  text: z.string().trim().min(3).max(500).optional(),
  ownerName: z.string().trim().max(120).nullish(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
});

export const PATCH = withScope(async (scope, req: Request, ctx: { params: Promise<{ id: string }> }) => {
  if (!scope.canEditDecisions) return NextResponse.json({ error: "Seu perfil não altera decisões." }, { status: 403 });
  const { id } = await ctx.params;
  const b = Body.parse(await req.json());
  const sql = getSql();
  const [before] = await sql`select * from app.decisions where id = ${id}`;
  if (!before) return NextResponse.json({ error: "Decisão não encontrada." }, { status: 404 });
  const [row] = await sql`update app.decisions set
      status = ${b.status ?? before.status}, text = ${b.text ?? before.text},
      owner_name = ${b.ownerName === undefined ? before.owner_name : b.ownerName}, due_date = ${b.dueDate === undefined ? before.due_date : b.dueDate}
    where id = ${id} returning id, week_start::text as week_start, text, owner_name, due_date::text as due_date, status, created_at`;
  await audit(scope.user.id, "alterar", "decisions", id, before, row);
  return NextResponse.json({ ok: true, decision: row });
});
