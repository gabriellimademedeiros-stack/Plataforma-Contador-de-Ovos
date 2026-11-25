import { NextResponse } from "next/server";
import { z } from "zod";
import { withScope } from "@/server/api";
import { addMemory } from "@/server/services/settings";

const Body = z.object({ text: z.string().trim().min(5, "escreva o que a plataforma deve lembrar").max(500) });

export const POST = withScope(async (scope, req: Request) => {
  const id = await addMemory(scope, Body.parse(await req.json()).text);
  return NextResponse.json({ ok: true, id });
});
