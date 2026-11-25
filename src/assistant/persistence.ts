import "server-only";
import { getSql } from "@/db/client";
import { farmToday } from "@/lib/dates";

export async function usageToday(userId: string) {
  const sql = getSql();
  const [r] = await sql`select messages from app.ai_usage where user_id = ${userId} and date = ${farmToday()}`;
  return Number(r?.messages ?? 0);
}

export async function addUsage(userId: string, input = 0, output = 0) {
  const sql = getSql();
  await sql`insert into app.ai_usage (user_id, date, messages, input_tokens, output_tokens) values (${userId}, ${farmToday()}, 1, ${input}, ${output})
    on conflict (user_id, date) do update set messages = app.ai_usage.messages + 1, input_tokens = app.ai_usage.input_tokens + ${input}, output_tokens = app.ai_usage.output_tokens + ${output}`;
}

export async function ensureConversation(userId: string, id: string | null | undefined, firstText: string): Promise<string> {
  const sql = getSql();
  if (id) {
    const [c] = await sql`select id from app.ai_conversations where id = ${id} and user_id = ${userId}`;
    if (c) return c.id;
  }
  const [c] = await sql`insert into app.ai_conversations (user_id, title) values (${userId}, ${firstText.slice(0, 80) || "Conversa"}) returning id`;
  return c.id;
}

export async function saveMessage(conversationId: string, role: string, content: unknown, mode: "ia" | "reserva", id?: string): Promise<string> {
  const sql = getSql();
  const [m] = id
    ? await sql`insert into app.ai_messages (id, conversation_id, role, content, mode) values (${id}, ${conversationId}, ${role}, ${JSON.stringify(content)}::jsonb, ${mode}) returning id`
    : await sql`insert into app.ai_messages (conversation_id, role, content, mode) values (${conversationId}, ${role}, ${JSON.stringify(content)}::jsonb, ${mode}) returning id`;
  return m.id;
}

export async function saveToolCall(messageId: string, tool: string, input: unknown, output: Record<string, unknown>, durationMs: number) {
  const sql = getSql();
  const summary = { fonte: output.fonte ?? null, avisos: output.avisos ?? [], erro: output.erro ?? null, chaves: Object.keys(output).slice(0, 12) };
  await sql`insert into app.ai_tool_calls (message_id, tool, input, output_summary, duration_ms) values (${messageId}, ${tool}, ${JSON.stringify(input ?? {})}::jsonb, ${JSON.stringify(summary)}::jsonb, ${Math.round(durationMs)})`;
}
