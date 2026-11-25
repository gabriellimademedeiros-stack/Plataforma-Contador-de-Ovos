import { NextResponse } from "next/server";
import { generateText } from "ai";
import { z } from "zod";
import { withScope } from "@/server/api";
import { aiModel } from "@/assistant/ai";
import { FIELD_EVENT_TYPES, interpretByKeywords } from "@/server/services/field";

const Body = z.object({ texto: z.string().trim().min(2).max(2000) });

/** Texto ditado → campos do evento para o usuário confirmar (IA quando houver chave; senão palavras-chave). */
export const POST = withScope(async (_scope, req: Request) => {
  const { texto } = Body.parse(await req.json());
  const kw = interpretByKeywords(texto);
  const model = aiModel();
  if (!model) return NextResponse.json({ ...kw, modo: "palavras-chave" });
  try {
    const r = await generateText({
      model,
      system: `Converta o relato de um funcionário de granja de ovos em JSON {"evento": um destes códigos ou null: ${FIELD_EVENT_TYPES.join(", ")}, "descricao": frase curta e objetiva em português}. Responda só o JSON. Nunca sugira medicamento.`,
      prompt: texto,
      maxOutputTokens: 200,
    });
    const j = JSON.parse(r.text.replace(/^```json|```$/g, "").trim());
    const evento = FIELD_EVENT_TYPES.includes(j.evento) ? j.evento : kw.evento;
    return NextResponse.json({ evento, descricao: String(j.descricao ?? texto).slice(0, 2000), modo: "ia" });
  } catch {
    return NextResponse.json({ ...kw, modo: "palavras-chave" });
  }
});
