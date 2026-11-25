import { NextResponse } from "next/server";
import { getSql } from "@/db/client";
import { withScope } from "@/server/api";
import { audit } from "@/server/audit";

export const DELETE = withScope(async (scope, _req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const sql = getSql();
  const [row] = await sql`delete from app.saved_comparisons where id = ${id} and user_id = ${scope.user.id} returning id, name, params`;
  if (!row) return NextResponse.json({ error: "Favorito não encontrado." }, { status: 404 });
  await audit(scope.user.id, "excluir", "saved_comparisons", id, row, null);
  return NextResponse.json({ ok: true });
});
