import { NextResponse } from "next/server";
import { withScope } from "@/server/api";
import { RuleUpdate, updateRule } from "@/server/services/settings";

export const POST = withScope(async (scope, req: Request) => {
  await updateRule(scope, RuleUpdate.parse(await req.json()));
  return NextResponse.json({ ok: true });
});
