import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@/db/client";
import { withScope } from "@/server/api";
import { audit } from "@/server/audit";
import { ComparisonParams } from "@/server/services/comparisons";

const Body = z.object({ name: z.string().trim().min(2, "dê um nome ao favorito").max(120), params: ComparisonParams });

/** "Salvar como relatório favorito" (guardado por usuário). */
export const GET = withScope(async (scope) => {
  const sql = getSql();
  const rows = await sql`select id, name, params, created_at from app.saved_comparisons where user_id = ${scope.user.id} order by created_at desc`;
  return NextResponse.json({ saved: rows });
});

export const POST = withScope(async (scope, req: Request) => {
  const b = Body.parse(await req.json());
  const sql = getSql();
  const [row] = await sql`insert into app.saved_comparisons (user_id, name, params) values (${scope.user.id}, ${b.name}, ${JSON.stringify(b.params)}::jsonb) returning id, name, params, created_at`;
  await audit(scope.user.id, "criar", "saved_comparisons", row.id, null, b);
  return NextResponse.json({ ok: true, saved: row });
});
