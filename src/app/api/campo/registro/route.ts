import { NextResponse } from "next/server";
import { withScope } from "@/server/api";
import { FieldEntry, registerFieldEntry } from "@/server/services/field";

export const maxDuration = 30;

/** Apontamentos do campo: mortalidade, ração, água, observação e evento (grava, recalcula e responde "Registrado ✓"). */
export const POST = withScope(async (scope, req: Request) => {
  const e = FieldEntry.parse(await req.json());
  const r = await registerFieldEntry(scope, e);
  return NextResponse.json({ ok: true, id: r.id, message: r.message, alerts: r.recompute?.opened ?? [], ms: r.recompute?.ms ?? null });
});
