import { NextResponse } from "next/server";
import { z } from "zod";
import { withScope } from "@/server/api";
import { assertConfig, previewRule } from "@/server/services/settings";

export const maxDuration = 60;
const Body = z.object({ code: z.string(), params: z.record(z.string(), z.number()) });

/** Prévia: quantas vezes a regra teria disparado nos últimos 90 dias com os parâmetros propostos (em memória). */
export const POST = withScope(async (scope, req: Request) => {
  assertConfig(scope);
  const b = Body.parse(await req.json());
  return NextResponse.json(await previewRule(b.code, b.params));
});
