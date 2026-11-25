"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface QuestionData {
  id: string;
  question: string;
  options: Array<{ code: string; label: string }>;
  house: string;
}

/** Pergunta da plataforma ao encarregado com respostas em botões (Partes 9.7 e 14.21). */
export function QuestionCard({ q, big = false }: { q: QuestionData; big?: boolean }) {
  const router = useRouter();
  const [sending, setSending] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function answer(code: string, label: string) {
    setSending(code);
    setError(null);
    try {
      const r = await fetch(`/api/perguntas/${q.id}/responder`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answerCode: code }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Não foi possível registrar a resposta.");
      setDone(label);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(null);
    }
  }

  if (done)
    return (
      <div className="flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 p-3 text-green-800">
        <CheckCircle2 className="size-5" /> Registrado ✓ — resposta: {done}. As hipóteses do alerta foram recalculadas.
      </div>
    );
  return (
    <div className="rounded-lg border bg-white p-3">
      <div className="text-xs font-medium text-muted-foreground">{q.house}</div>
      <div className={big ? "mt-1 text-lg font-semibold" : "mt-1 font-medium"}>{q.question}</div>
      <div className={`mt-3 grid gap-2 ${big ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"}`}>
        {q.options.map((o) => (
          <Button key={o.code} variant="outline" size={big ? "xl" : "default"} className="justify-start whitespace-normal text-left" disabled={!!sending} onClick={() => answer(o.code, o.label)}>
            {sending === o.code && <Loader2 className="animate-spin" />}
            {o.label}
          </Button>
        ))}
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
