import { NextResponse } from "next/server";
import { z } from "zod";
import { withScope } from "@/server/api";
import { setMemoryActive } from "@/server/services/settings";

export const PATCH = withScope(async (scope, req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  await setMemoryActive(scope, id, z.object({ active: z.boolean() }).parse(await req.json()).active);
  return NextResponse.json({ ok: true });
});
