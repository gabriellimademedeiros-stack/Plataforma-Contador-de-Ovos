import { randomUUID } from "node:crypto";
import { convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, isStepCount, streamText, toUIMessageStream, type UIMessage } from "ai";
import { z } from "zod";
import { withScope } from "@/server/api";
import { aiModel, buildAITools, systemFor, type ToolCallLog } from "@/assistant/ai";
import { fallbackAnswer } from "@/assistant/fallback";
import { addUsage, ensureConversation, saveMessage, saveToolCall, usageToday } from "@/assistant/persistence";

export const maxDuration = 60;

const Body = z.object({
  messages: z.array(z.any()).min(1),
  conversationId: z.string().uuid().nullish(),
  context: z.record(z.string(), z.unknown()).nullish(),
});

function lastUserText(messages: UIMessage[]): string {
  const m = [...messages].reverse().find((x) => x.role === "user");
  return (m?.parts ?? []).map((p) => (p.type === "text" ? p.text : "")).join(" ").trim();
}

export const POST = withScope(async (scope, req: Request) => {
  const body = Body.parse(await req.json());
  const messages = body.messages as UIMessage[];
  const question = lastUserText(messages);
  const limit = Number(process.env.ASSISTANT_DAILY_LIMIT ?? 60);
  const used = await usageToday(scope.user.id);
  const limited = used >= limit;
  const model = aiModel();
  const mode: "ia" | "reserva" = model && !limited ? "ia" : "reserva";
  const conversationId = await ensureConversation(scope.user.id, body.conversationId, question);
  await saveMessage(conversationId, "user", { text: question, context: body.context ?? null }, mode);
  const assistantId = randomUUID();
  const ctx = { scope };

  if (mode === "reserva") {
    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        writer.write({ type: "start", messageId: assistantId });
        writer.write({ type: "data-meta", data: { conversationId, messageId: assistantId, mode, limited } } as never);
        const t0 = Date.now();
        const ans = await fallbackAnswer(ctx, question, body.context ?? {});
        for (const [i, s] of ans.steps.entries()) {
          const id = `fb-${i}`;
          writer.write({ type: "tool-input-available", toolCallId: id, toolName: s.tool, input: s.input });
          writer.write({ type: "tool-output-available", toolCallId: id, output: s.output as never });
        }
        const text = (limited ? `Você atingiu o limite de ${limit} mensagens com IA por hoje; sigo no modo reserva, que continua disponível.\n\n` : "") + ans.text;
        writer.write({ type: "text-start", id: "t" });
        for (const chunk of text.match(/[\s\S]{1,60}/g) ?? []) writer.write({ type: "text-delta", id: "t", delta: chunk });
        writer.write({ type: "text-end", id: "t" });
        writer.write({ type: "finish" });
        await saveMessage(conversationId, "assistant", { text, tools: ans.steps.map((s) => ({ tool: s.tool, input: s.input })), recognized: ans.recognized }, mode, assistantId);
        for (const s of ans.steps) await saveToolCall(assistantId, s.tool, s.input, s.output, (Date.now() - t0) / Math.max(1, ans.steps.length));
      },
    });
    return createUIMessageStreamResponse({ stream });
  }

  // Modo com IA: Vercel AI SDK + Anthropic, até 8 passos de ferramentas
  const system = await systemFor(ctx, body.context);
  const calls: ToolCallLog[] = [];
  const tools = buildAITools(ctx, calls);
  const result = streamText({
    model: model!,
    system,
    messages: await convertToModelMessages(messages),
    tools: tools as never,
    stopWhen: isStepCount(8),
    maxOutputTokens: 2000,
    onFinish: async (ev: { text: string; totalUsage?: { inputTokens?: number; outputTokens?: number } }) => {
      await saveMessage(conversationId, "assistant", { text: ev.text, tools: calls.map((c) => ({ tool: c.tool, input: c.input })) }, mode, assistantId);
      for (const c of calls) await saveToolCall(assistantId, c.tool, c.input, c.output, c.ms);
      await addUsage(scope.user.id, ev.totalUsage?.inputTokens ?? 0, ev.totalUsage?.outputTokens ?? 0);
    },
  } as never);
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      writer.write({ type: "data-meta", data: { conversationId, messageId: assistantId, mode, limited: false } } as never);
      writer.merge(toUIMessageStream({ stream: (result as unknown as { stream: ReadableStream }).stream, generateMessageId: () => assistantId, onError: () => "Não consegui falar com o serviço de IA agora. Tente de novo em instantes." } as never) as never);
    },
  });
  return createUIMessageStreamResponse({ stream });
});
