import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@/db/client";
import { withScope } from "@/server/api";

const Body = z.object({ messageId: z.string().uuid(), feedback: z.enum(["util", "nao_util"]) });

export const POST = withScope(async (scope, req: Request) => {
  const b = Body.parse(await req.json());
  const sql = getSql();
  await sql`update app.ai_messages m set feedback = ${b.feedback} from app.ai_conversations c where m.id = ${b.messageId} and c.id = m.conversation_id and c.user_id = ${scope.user.id}`;
  return NextResponse.json({ ok: true });
});
