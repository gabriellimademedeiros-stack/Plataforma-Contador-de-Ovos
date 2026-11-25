"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";

export function CertaintyControl({ eventId, current }: { eventId: string; current: string }) {
  const router = useRouter();
  const [to, setTo] = useState(current);
  const [by, setBy] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function save() {
    setBusy(true);
    setErr(null);
    const r = await fetch(`/api/eventos/${eventId}/certeza`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ certainty: to, confirmedBy: to === "confirmado" && by ? by : null, note: note || null }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(d.error ?? "Não foi possível alterar.");
    setNote("");
    router.refresh();
  }
  return (
    <div className="space-y-2 rounded-md border p-2">
      <div className="text-xs font-medium">Mudar a certeza</div>
      <NativeSelect className="w-full" value={to} onChange={(e) => setTo(e.target.value)}>
        <option value="suspeito">Suspeito</option>
        <option value="provavel">Provável</option>
        <option value="confirmado">Confirmado</option>
        <option value="descartado">Descartado</option>
      </NativeSelect>
      {to === "confirmado" && (
        <NativeSelect className="w-full" value={by} onChange={(e) => setBy(e.target.value)}>
          <option value="">Confirmado por…</option>
          <option value="clinica">Clínica</option>
          <option value="laboratorio">Laboratório</option>
          <option value="necropsia">Necropsia</option>
        </NativeSelect>
      )}
      <Input placeholder="Nota (opcional)" value={note} onChange={(e) => setNote(e.target.value)} />
      {err && <p className="text-xs text-red-700">{err}</p>}
      <Button size="sm" className="w-full" disabled={busy || to === current} onClick={save}>
        Salvar
      </Button>
    </div>
  );
}
