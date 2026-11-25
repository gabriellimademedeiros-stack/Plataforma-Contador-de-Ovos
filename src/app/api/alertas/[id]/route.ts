import { NextResponse } from "next/server";
import { withScope } from "@/server/api";
import { AlertAction, applyAlertAction } from "@/server/services/alerts";

export const PATCH = withScope(async (scope, req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  await applyAlertAction(scope, id, AlertAction.parse(await req.json()));
  return NextResponse.json({ ok: true });
});
