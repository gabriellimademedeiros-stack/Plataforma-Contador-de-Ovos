/**
 * Caminho "com IA" da rota /api/assistente, exercitado com um modelo simulado do AI SDK (sem chave real):
 * o modelo pede uma ferramenta, recebe o resultado e responde; conferimos o streaming, o meta, a gravação
 * da conversa, das chamadas de ferramenta e do consumo em ai_usage.
 */
import { config } from "dotenv";
import postgres from "postgres";
import { describe, expect, it, vi } from "vitest";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { scopeForUser, type Scope } from "@/server/permissions";

config({ path: ".env.local", quiet: true });

async function demoDbReady(): Promise<boolean> {
  const url = process.env.DATABASE_URL;
  if (!url) return false;
  const sql = postgres(url, { prepare: false, max: 1, connect_timeout: 3, onnotice: () => {} });
  try {
    const [r] = await sql`select count(*)::int as n from app.daily_metrics`;
    return r.n > 0;
  } catch {
    return false;
  } finally {
    await sql.end({ timeout: 1 });
  }
}
const hasDb = await demoDbReady();

const usage = { inputTokens: { total: 120, noCache: 120, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 40, text: 40, reasoning: 0 } };
let call = 0;
const model = new MockLanguageModelV4({
  doStream: async () => {
    call++;
    const chunks =
      call === 1
        ? [
            { type: "stream-start", warnings: [] },
            { type: "tool-call", toolCallId: "c1", toolName: "listar_alertas", input: JSON.stringify({ situacao: "abertos" }) },
            { type: "finish", finishReason: { unified: "tool-calls", raw: "tool_use" }, usage },
          ]
        : [
            { type: "stream-start", warnings: [] },
            { type: "text-start", id: "t1" },
            { type: "text-delta", id: "t1", delta: "Há alertas abertos agora." },
            { type: "text-end", id: "t1" },
            { type: "finish", finishReason: { unified: "stop", raw: "end_turn" }, usage },
          ];
    return { stream: simulateReadableStream({ chunks: chunks as never[] }) };
  },
});

let scopeRef: Scope | null = null;
vi.mock("@/assistant/ai", async (orig) => ({ ...(await orig<typeof import("@/assistant/ai")>()), aiModel: () => model }));
vi.mock("@/server/api", () => ({ withScope: (h: (s: Scope, r: Request) => Promise<Response>) => (r: Request) => h(scopeRef!, r) }));

describe.skipIf(!hasDb)("rota do assistente — modo com IA (modelo simulado)", () => {
  it("transmite ferramenta + texto e grava conversa, ferramentas e consumo", async () => {
    const { getSql } = await import("@/db/client");
    const { getHouses } = await import("@/server/repositories/reference");
    const [u] = await getSql()`select id, email, name, role, allowed_house_ids from app.users where email = 'gerente@demo.local'`;
    scopeRef = scopeForUser({ id: u.id, email: u.email, name: u.name, role: u.role, allowedHouseIds: u.allowed_house_ids ?? null }, await getHouses());
    const [before] = await getSql()`select coalesce(sum(messages), 0)::int as n from app.ai_usage where user_id = ${u.id}`;
    const { POST } = await import("@/app/api/assistente/route");
    const res = await (POST as unknown as (r: Request) => Promise<Response>)(
      new Request("http://x/api/assistente", { method: "POST", body: JSON.stringify({ messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: "Quais alertas estão abertos?" }] }] }) }),
    );
    const body = await res.text();
    const parts = body.split("\n").filter((l) => l.startsWith("data: {")).map((l) => JSON.parse(l.slice(6)));
    const meta = parts.find((p) => p.type === "data-meta");
    expect(meta.data.mode).toBe("ia");
    expect(parts.some((p) => p.type === "tool-input-available" && p.toolName === "listar_alertas")).toBe(true);
    expect(parts.some((p) => p.type === "tool-output-available" && Array.isArray(p.output.alertas))).toBe(true);
    expect(parts.filter((p) => p.type === "text-delta").map((p) => p.delta).join("")).toBe("Há alertas abertos agora.");
    await new Promise((r) => setTimeout(r, 300));
    const [m] = await getSql()`select id, content, mode from app.ai_messages where id = ${meta.data.messageId}`;
    expect(m.mode).toBe("ia");
    expect(m.content.text).toBe("Há alertas abertos agora.");
    const tc = await getSql()`select tool from app.ai_tool_calls where message_id = ${meta.data.messageId}`;
    expect(tc.map((t) => t.tool)).toEqual(["listar_alertas"]);
    const [after] = await getSql()`select coalesce(sum(messages), 0)::int as n, coalesce(sum(input_tokens), 0)::int as i from app.ai_usage where user_id = ${u.id}`;
    expect(after.n).toBe(before.n + 1);
    expect(after.i).toBeGreaterThanOrEqual(240);
    // limpeza: a demonstração fica como estava
    await getSql()`delete from app.ai_tool_calls where message_id in (select id from app.ai_messages where conversation_id = ${meta.data.conversationId})`;
    await getSql()`delete from app.ai_messages where conversation_id = ${meta.data.conversationId}`;
    await getSql()`delete from app.ai_conversations where id = ${meta.data.conversationId}`;
    await getSql()`update app.ai_usage set messages = messages - 1, input_tokens = input_tokens - 240, output_tokens = output_tokens - 80 where user_id = ${u.id} and messages > 0 and date = (select max(date) from app.ai_usage where user_id = ${u.id})`;
  });
});
