"use client";
import { Bot } from "lucide-react";
import { askAI } from "@/components/charts/echart";

/** Botão "Explicar com IA": envia a mesma evidência ao assistente (Parte 11.7). */
export function ExplainWithAI({ text }: { text: string }) {
  return (
    <button className="mt-2 flex items-center gap-1 text-xs text-primary hover:underline" onClick={() => askAI("Explique esta análise de causa em linguagem simples, sem usar números que não estejam na evidência.", { evidencia: text })}>
      <Bot className="size-3.5" /> Explicar com IA
    </button>
  );
}
