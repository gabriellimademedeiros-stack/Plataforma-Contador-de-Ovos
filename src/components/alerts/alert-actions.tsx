"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarPlus, Check, Eye, Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AskButton } from "@/components/house/ask-button";

export function AlertActions(props: { id: string; status: string; house: string | null; canResolve: boolean; causes: Array<{ code: string; name: string }>; conditionPersists: boolean; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<null | "resolver" | "descartar">(null);
  const [cause, setCause] = useState(props.causes[0]?.code ?? "desconhecida");
  const [note, setNote] = useState("");
  const [action, setAction] = useState("");
  const [useful, setUseful] = useState<boolean | null>(null);
  const [accept, setAccept] = useState(false);
  const [days, setDays] = useState(28);
  const [reason, setReason] = useState("variação normal");
  const closed = ["resolvido", "descartado"].includes(props.status);

  async function send(body: unknown) {
    setBusy(true);
    setErr(null);
    const r = await fetch(`/api/alertas/${props.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(d.error ?? "Não foi possível concluir.");
    setMode(null);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!closed && props.status === "aberto" && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => send({ action: "reconhecer" })}>
          <Eye /> Reconhecer
        </Button>
      )}
      {!closed && props.canResolve && props.status !== "em_investigacao" && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => send({ action: "investigar" })}>
          <Search /> Em investigação
        </Button>
      )}
      {!closed && props.canResolve && (
        <>
          <Button size="sm" disabled={busy} onClick={() => setMode("resolver")}>
            <Check /> Resolver
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setMode("descartar")}>
            <X /> Descartar
          </Button>
        </>
      )}
      {props.house && (
        <Button size="sm" variant="outline" asChild>
          <Link href={`/eventos/novo?galpao=${props.house}&alerta=${props.id}`}>
            <CalendarPlus /> Registrar evento
          </Link>
        </Button>
      )}
      <AskButton question="Explique este alerta e as hipóteses de causa" context={{ alerta: props.id, titulo: props.title, galpao: props.house }} />
      {busy && <Loader2 className="size-4 animate-spin" />}
      {err && <span className="text-sm text-red-700">{err}</span>}

      <Dialog open={mode === "resolver"} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolver alerta</DialogTitle>
            <DialogDescription>A causa é obrigatória. Ela alimenta a memória de casos parecidos.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Causa</Label>
              <NativeSelect className="w-full" value={cause} onChange={(e) => setCause(e.target.value)}>
                {props.causes.map((c) => (
                  <option key={c.code} value={c.code}>{c.name}</option>
                ))}
              </NativeSelect>
            </div>
            {cause === "outra" && <Input placeholder="Descreva a causa" value={note} onChange={(e) => setNote(e.target.value)} />}
            {cause !== "outra" && <Textarea placeholder="Nota (opcional)" value={note} onChange={(e) => setNote(e.target.value)} />}
            <Input placeholder="Ação tomada (opcional)" value={action} onChange={(e) => setAction(e.target.value)} />
            <div className="space-y-1.5">
              <Label>Este alerta foi útil?</Label>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant={useful === true ? "default" : "outline"} onClick={() => setUseful(true)}>Sim</Button>
                <Button type="button" size="sm" variant={useful === false ? "default" : "outline"} onClick={() => setUseful(false)}>Não</Button>
              </div>
            </div>
            {props.conditionPersists && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
                Aceitar a nova condição por <Input type="number" className="w-20" value={days} min={1} max={180} onChange={(e) => setDays(Number(e.target.value))} /> dias (silencia esta regra neste galpão)
              </label>
            )}
            <Button className="w-full" disabled={busy || useful == null || (cause === "outra" && !note.trim())} onClick={() => send({ action: "resolver", causeCode: cause, causeNote: note || null, actionTaken: action || null, wasUseful: useful, acceptDays: accept ? days : null })}>
              Confirmar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={mode === "descartar"} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Descartar alerta</DialogTitle>
            <DialogDescription>Informe o motivo.</DialogDescription>
          </DialogHeader>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button disabled={busy || reason.trim().length < 3} onClick={() => send({ action: "descartar", reason })}>
            Descartar
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
