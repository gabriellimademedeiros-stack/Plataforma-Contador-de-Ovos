"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { fmtDateTime } from "@/lib/format";

export function HouseNotes({ house, notes }: { house: string; notes: Array<{ id: string; text: string; createdAt: string; author: string }> }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    const r = await fetch("/api/notas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ house, text }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(d.error ?? "Não foi possível salvar.");
    setText("");
    router.refresh();
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Escreva uma anotação para a equipe…" className="min-h-12" maxLength={2000} />
        <Button onClick={save} disabled={busy || !text.trim()}>
          Salvar
        </Button>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <ul className="space-y-2">
        {notes.length === 0 && <li className="text-sm text-muted-foreground">Nenhuma anotação ainda.</li>}
        {notes.map((n) => (
          <li key={n.id} className="rounded-md border p-2 text-sm">
            <div className="whitespace-pre-wrap">{n.text}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {n.author} · {fmtDateTime(n.createdAt)}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
