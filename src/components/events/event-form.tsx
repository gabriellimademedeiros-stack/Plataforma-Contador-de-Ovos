"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/misc";
import type { EventTypeDef } from "@/engine/impacts/event-types";
import { CATEGORY_LABEL } from "@/engine/impacts/event-types";

function nowLocal() {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const g = (t: string) => p.find((x) => x.type === t)?.value;
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}

export function EventForm({ houses, types, initial }: { houses: string[]; types: EventTypeDef[]; initial: { house?: string; type?: string; alertId?: string } }) {
  const router = useRouter();
  const [type, setType] = useState(types.find((t) => t.code === initial.type)?.code ?? types[0].code);
  const def = useMemo(() => types.find((t) => t.code === type)!, [type, types]);
  const [sel, setSel] = useState<string[]>(initial.house && houses.includes(initial.house) ? [initial.house] : []);
  const [title, setTitle] = useState("");
  const [start, setStart] = useState(nowLocal());
  const [end, setEnd] = useState("");
  const [severity, setSeverity] = useState("media");
  const [certainty, setCertainty] = useState("suspeito");
  const [confirmedBy, setConfirmedBy] = useState("");
  const [description, setDescription] = useState("");
  const [action, setAction] = useState("");
  const [cost, setCost] = useState("");
  const [details, setDetails] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const carencia = Number(details.carencia_dias ?? 0);
  const liberado = def.code === "sanitario.medicacao" && carencia > 0 ? new Date(new Date(start).getTime() + carencia * 86400000).toLocaleDateString("pt-BR") : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/eventos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          typeCode: type,
          houses: sel,
          title: title || def.name,
          startsAt: start,
          endsAt: end || null,
          severity,
          certainty,
          confirmedBy: certainty === "confirmado" && confirmedBy ? confirmedBy : null,
          description: description || null,
          details,
          actionTaken: action || null,
          costBrl: cost ? Number(cost.replace(",", ".")) : null,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Não foi possível registrar.");
      router.push(`/eventos/${d.id}`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border bg-card p-4 shadow-sm">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Tipo</Label>
          <NativeSelect className="w-full" value={type} onChange={(e) => { setType(e.target.value); setDetails({}); }}>
            {Object.entries(CATEGORY_LABEL).map(([cat, label]) => (
              <optgroup key={cat} label={label}>
                {types.filter((t) => t.category === cat).map((t) => (
                  <option key={t.code} value={t.code}>{t.name}</option>
                ))}
              </optgroup>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label>Título</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={def.name} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Galpões (escopo)</Label>
        <div className="flex flex-wrap gap-3">
          {houses.map((h) => (
            <label key={h} className="flex items-center gap-1.5 text-sm">
              <Checkbox checked={sel.includes(h)} onCheckedChange={(c) => setSel((s) => (c ? [...s, h] : s.filter((x) => x !== h)))} /> {h}
            </label>
          ))}
          <button type="button" className="text-xs text-primary hover:underline" onClick={() => setSel(houses)}>todos</button>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Início</Label>
          <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label>Fim (opcional)</Label>
          <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>
      {def.fields.length > 0 && (
        <div className="grid gap-4 rounded-lg bg-muted/40 p-3 sm:grid-cols-2">
          {def.fields.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label>
                {f.label} {f.unit && <span className="text-muted-foreground">({f.unit})</span>}
              </Label>
              {f.type === "select" ? (
                <NativeSelect className="w-full" value={String(details[f.key] ?? "")} onChange={(e) => setDetails({ ...details, [f.key]: e.target.value })}>
                  <option value="">—</option>
                  {f.options!.map((o) => <option key={o}>{o}</option>)}
                </NativeSelect>
              ) : f.type === "multiselect" ? (
                <div className="flex flex-wrap gap-2">
                  {f.options!.map((o) => {
                    const cur = (details[f.key] as string[]) ?? [];
                    return (
                      <label key={o} className="flex items-center gap-1 text-xs">
                        <Checkbox checked={cur.includes(o)} onCheckedChange={(c) => setDetails({ ...details, [f.key]: c ? [...cur, o] : cur.filter((x) => x !== o) })} /> {o}
                      </label>
                    );
                  })}
                </div>
              ) : (
                <Input type={f.type === "number" ? "number" : "text"} value={String(details[f.key] ?? "")} onChange={(e) => setDetails({ ...details, [f.key]: f.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value })} />
              )}
            </div>
          ))}
          {liberado && <div className="text-sm text-amber-800 sm:col-span-2">Ovos liberados a partir de {liberado}.</div>}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Severidade</Label>
          <NativeSelect className="w-full" value={severity} onChange={(e) => setSeverity(e.target.value)}>
            <option value="baixa">Baixa</option>
            <option value="media">Média</option>
            <option value="alta">Alta</option>
            <option value="critica">Crítica</option>
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label>Certeza</Label>
          <NativeSelect className="w-full" value={certainty} onChange={(e) => setCertainty(e.target.value)}>
            <option value="suspeito">Suspeito</option>
            <option value="provavel">Provável</option>
            <option value="confirmado">Confirmado</option>
          </NativeSelect>
        </div>
        {certainty === "confirmado" && (
          <div className="space-y-1.5">
            <Label>Confirmado por</Label>
            <NativeSelect className="w-full" value={confirmedBy} onChange={(e) => setConfirmedBy(e.target.value)}>
              <option value="">—</option>
              <option value="clinica">Clínica</option>
              <option value="laboratorio">Laboratório</option>
              <option value="necropsia">Necropsia</option>
            </NativeSelect>
          </div>
        )}
      </div>
      <div className="space-y-1.5">
        <Label>Descrição</Label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Ação tomada</Label>
          <Input value={action} onChange={(e) => setAction(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Custo (R$, opcional)</Label>
          <Input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
        </div>
      </div>
      {error && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancelar</Button>
        <Button type="submit" disabled={busy || sel.length === 0}>
          {busy && <Loader2 className="animate-spin" />} Registrar
        </Button>
      </div>
    </form>
  );
}
