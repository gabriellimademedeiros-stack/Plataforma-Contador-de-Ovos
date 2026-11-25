import { NextResponse } from "next/server";
import { withScope } from "@/server/api";
import { createEvent, EventInput } from "@/server/services/events";

export const maxDuration = 30;

export const POST = withScope(async (scope, req: Request) => {
  const input = EventInput.parse(await req.json());
  if (!scope.canRegister) return NextResponse.json({ error: "Sem permissão para registrar eventos." }, { status: 403 });
  const id = await createEvent(scope, input);
  return NextResponse.json({ ok: true, id });
});
