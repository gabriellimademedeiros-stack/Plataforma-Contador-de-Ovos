import { NextResponse } from "next/server";
import { withScope } from "@/server/api";
import { CostUpdate, updateCost } from "@/server/services/settings";

export const POST = withScope(async (scope, req: Request) => {
  await updateCost(scope, CostUpdate.parse(await req.json()));
  return NextResponse.json({ ok: true });
});
