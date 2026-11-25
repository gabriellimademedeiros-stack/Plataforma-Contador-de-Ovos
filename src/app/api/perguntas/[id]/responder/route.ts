import { NextResponse } from "next/server";
import { z } from "zod";
import { withScope } from "@/server/api";
import { answerQuestion } from "@/server/services/alerts";

export const maxDuration = 30;
const Body = z.object({ answerCode: z.string().min(1), answerText: z.string().max(1000).nullish() });

export const POST = withScope(async (scope, req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const b = Body.parse(await req.json());
  await answerQuestion(scope, id, b.answerCode, b.answerText);
  return NextResponse.json({ ok: true });
});
