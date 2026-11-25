import { NextResponse } from "next/server";
import { withScope } from "@/server/api";
import { getLiveToday } from "@/server/services/live-today";

export const GET = withScope(async (scope, _req: Request, ctx: { params: Promise<{ codigo: string }> }) => {
  const { codigo } = await ctx.params;
  return NextResponse.json({ hoje: await getLiveToday(scope, codigo.toUpperCase()) });
});
