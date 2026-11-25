/**
 * Peças do modo com IA compartilhadas pela rota /api/assistente e pelo script de avaliação:
 * configuração (chave + modelo) e as 11 ferramentas embrulhadas para o Vercel AI SDK.
 */
import "server-only";
import { createAnthropic } from "@ai-sdk/anthropic";
import { getSql } from "@/db/client";
import { getRefDate } from "@/server/repositories/reference";
import { buildSystemPrompt } from "./system-prompt";
import { TOOL_DEFS, runTool, type ToolName } from "./tools/registry";
import type { ToolContext } from "./tools/core";

export interface ToolCallLog {
  tool: ToolName;
  input: unknown;
  output: Record<string, unknown>;
  ms: number;
}

/** Modelo configurado (ANTHROPIC_API_KEY + ANTHROPIC_MODEL) ou null → modo reserva. */
export function aiModel() {
  const key = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL;
  if (!key || !model) return null;
  return createAnthropic({ apiKey: key })(model);
}

export function buildAITools(ctx: ToolContext, calls: ToolCallLog[]) {
  return Object.fromEntries(
    (Object.keys(TOOL_DEFS) as ToolName[]).map((name) => [
      name,
      {
        description: TOOL_DEFS[name].description,
        inputSchema: TOOL_DEFS[name].inputSchema,
        execute: async (input: unknown) => {
          const t0 = Date.now();
          const out = await runTool(ctx, name, input);
          calls.push({ tool: name, input, output: out, ms: Date.now() - t0 });
          return out;
        },
      },
    ]),
  );
}

export function contextText(c: Record<string, unknown> | null | undefined): string {
  if (!c) return "";
  return Object.entries(c)
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
    .join(" · ")
    .slice(0, 800);
}

export async function systemFor(ctx: ToolContext, context: Record<string, unknown> | null | undefined) {
  const sql = getSql();
  const memory = (await sql`select text from app.company_memory where active order by created_at desc limit 30`).map((r) => r.text as string);
  return buildSystemPrompt({ scope: ctx.scope, refDate: await getRefDate(), context: contextText(context), memory });
}
