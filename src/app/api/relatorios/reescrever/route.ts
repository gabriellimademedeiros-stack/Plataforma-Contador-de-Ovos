import { NextResponse } from "next/server";
import { generateText } from "ai";
import { z } from "zod";
import { withScope } from "@/server/api";
import { aiModel } from "@/assistant/ai";
import { reportForViewer } from "@/server/services/reports/runs";
import { addUsage, usageToday } from "@/assistant/persistence";

export const maxDuration = 60;
const Body = z.object({ tipo: z.enum(["semanal", "comparativo"]), semana: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

/** "Reescrever resumo com IA" (Parte 15.1, opcional): reescreve o texto do resumo usando só os números do relatório. */
export const POST = withScope(async (scope, req: Request) => {
  const model = aiModel();
  if (!model) return NextResponse.json({ error: "A IA não está configurada nesta demonstração." }, { status: 400 });
  if ((await usageToday(scope.user.id)) >= Number(process.env.ASSISTANT_DAILY_LIMIT ?? 60)) return NextResponse.json({ error: "Limite diário de uso da IA atingido." }, { status: 429 });
  const b = Body.parse(await req.json());
  const { model: rep } = await reportForViewer(b.tipo, scope, b.semana);
  const facts = JSON.stringify(rep.pages.slice(0, 2));
  const r = await generateText({
    model,
    system: "Você escreve resumos executivos em português do Brasil para a diretoria de uma granja de ovos (dados simulados). Use SOMENTE os números presentes nos dados fornecidos, sem inventar nem recalcular. Nunca prescreva medicamento. Até 5 frases curtas.",
    prompt: `Reescreva o resumo da ${rep.weekLabel.toLowerCase()} a partir destes dados do relatório (JSON):\n${facts}`,
    maxOutputTokens: 600,
  });
  await addUsage(scope.user.id, r.usage?.inputTokens ?? 0, r.usage?.outputTokens ?? 0);
  return NextResponse.json({ ok: true, text: r.text });
});
