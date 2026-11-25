import { NextResponse } from "next/server";
import { withScope } from "@/server/api";
import { audit } from "@/server/audit";
import { addShelfMeasurement, ShelfMeasureInput } from "@/server/services/lab";

export const POST = withScope(async (scope, req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const b = ShelfMeasureInput.parse(await req.json());
  const mid = await addShelfMeasurement(scope, id, b);
  await audit(scope.user.id, "criar", "shelf_life_measurements", mid, null, { test: id, ...b });
  return NextResponse.json({ ok: true, id: mid });
});
