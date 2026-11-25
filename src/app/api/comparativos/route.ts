import { NextResponse } from "next/server";
import { withScope } from "@/server/api";
import { ComparisonParams, runComparison } from "@/server/services/comparisons";

export const maxDuration = 30;

export const POST = withScope(async (scope, req: Request) => {
  const p = ComparisonParams.parse(await req.json());
  return NextResponse.json(await runComparison(scope, p));
});
