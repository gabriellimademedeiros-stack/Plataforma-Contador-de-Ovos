import { NextResponse } from "next/server";
import { getSql } from "@/db/client";
import { withScope } from "@/server/api";

/** Histórico de conversas do usuário (página cheia do assistente). */
export const GET = withScope(async (scope, req: Request) => {
  const sql = getSql();
  const id = new URL(req.url).searchParams.get("id");
  if (id) {
    const msgs = await sql`select m.id, m.role, m.content, m.mode, m.feedback, m.created_at from app.ai_messages m join app.ai_conversations c on c.id = m.conversation_id
      where c.id = ${id} and c.user_id = ${scope.user.id} order by m.created_at`;
    return NextResponse.json({ messages: msgs });
  }
  const list = await sql`select id, title, created_at from app.ai_conversations where user_id = ${scope.user.id} order by created_at desc limit 50`;
  return NextResponse.json({ conversations: list });
});
