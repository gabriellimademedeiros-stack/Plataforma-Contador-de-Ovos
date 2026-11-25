import { NextResponse } from "next/server";
import { z } from "zod";
import { withScope } from "@/server/api";
import { audit } from "@/server/audit";
import { getHaughLimit, setHaughLimit } from "@/server/services/lab";

const Body = z.object({ haughLimit: z.number().min(40).max(90) });

/** Limite de Unidade Haugh para a vida útil estimada (configurável; padrão 60). */
export const POST = withScope(async (scope, req: Request) => {
  const b = Body.parse(await req.json());
  const before = await getHaughLimit();
  await setHaughLimit(scope, b.haughLimit);
  await audit(scope.user.id, "alterar", "system_state", null, { haughLimit: before }, b);
  return NextResponse.json({ ok: true });
});
