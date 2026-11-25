import { NextResponse } from "next/server";
import { withScope } from "@/server/api";
import { audit } from "@/server/audit";
import { createShelfTest, ShelfTestInput } from "@/server/services/lab";

export const POST = withScope(async (scope, req: Request) => {
  const b = ShelfTestInput.parse(await req.json());
  const id = await createShelfTest(scope, b);
  await audit(scope.user.id, "criar", "shelf_life_tests", id, null, b);
  return NextResponse.json({ ok: true, id });
});
