import { NextResponse } from "next/server";
import { withScope } from "@/server/api";
import { EventPatch, updateEvent } from "@/server/services/events";

export const maxDuration = 30;

export const PATCH = withScope(async (scope, req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  await updateEvent(scope, id, EventPatch.parse(await req.json()));
  return NextResponse.json({ ok: true });
});
