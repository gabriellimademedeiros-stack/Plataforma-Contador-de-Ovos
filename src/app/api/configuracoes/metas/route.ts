import { NextResponse } from "next/server";
import { withScope } from "@/server/api";
import { TargetUpdate, updateTarget } from "@/server/services/settings";

export const POST = withScope(async (scope, req: Request) => {
  await updateTarget(scope, TargetUpdate.parse(await req.json()));
  return NextResponse.json({ ok: true });
});
