import { NextResponse } from "next/server";
import { withScope } from "@/server/api";
import { audit } from "@/server/audit";
import { createShellSample, ShellSampleInput } from "@/server/services/lab";

export const POST = withScope(async (scope, req: Request) => {
  const b = ShellSampleInput.parse(await req.json());
  const id = await createShellSample(scope, b);
  await audit(scope.user.id, "criar", "lab_samples", id, null, b);
  return NextResponse.json({ ok: true, id });
});
