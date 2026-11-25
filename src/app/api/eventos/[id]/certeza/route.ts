import { NextResponse } from "next/server";
import { z } from "zod";
import { withScope } from "@/server/api";
import { changeCertainty } from "@/server/services/events";

export const maxDuration = 30;

const Body = z.object({
  certainty: z.enum(["suspeito", "provavel", "confirmado", "descartado"]),
  confirmedBy: z.enum(["clinica", "laboratorio", "necropsia"]).nullish(),
  note: z.string().max(1000).nullish(),
});

export const POST = withScope(async (scope, req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const b = Body.parse(await req.json());
  await changeCertainty(scope, id, b.certainty, b.confirmedBy ?? null, b.note ?? null);
  return NextResponse.json({ ok: true });
});
