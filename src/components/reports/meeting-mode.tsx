"use client";
/**
 * Modo reunião (Parte 15.4): as 11 páginas do Relatório Semanal como slides (setas do teclado, contador, sair),
 * slide extra com as decisões da reunião anterior, painel recolhível para registrar decisões e "Encerrar reunião".
 */
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, ClipboardList, Loader2, PanelRightClose, PanelRightOpen, Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ReportPageView } from "./report-page";
import type { ReportModel } from "./types";

export interface Decision {
  id: string;
  week_start: string;
  text: string;
  owner_name: string | null;
  due_date: string | null;
  status: "aberta" | "concluida" | "cancelada";
}

const ST: Record<string, string> = { aberta: "aberta", concluida: "concluída", cancelada: "cancelada" };
const dmy = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "—");

async function patch(id: string, body: Record<string, unknown>): Promise<Decision | null> {
  const r = await fetch(`/api/decisoes/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) return null;
  return (await r.json()).decision;
}

function PreviousSlide({ decisions, setDecisions, canEdit, prevLabel }: { decisions: Decision[]; setDecisions: (d: Decision[]) => void; canEdit: boolean; prevLabel: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <section className="flex h-[198mm] w-[285mm] flex-col bg-white p-[8mm]">
      <h2 className="text-2xl font-semibold">Decisões da reunião anterior</h2>
      <p className="mb-4 text-sm text-slate-500">Reunião da {prevLabel.toLowerCase()} · marque o que foi concluído ou cancelado</p>
      {decisions.length === 0 && <p className="text-slate-500">Nenhuma decisão registrada na reunião anterior.</p>}
      <div className="space-y-3">
        {decisions.map((d) => (
          <div key={d.id} className={cn("flex items-center gap-4 rounded-xl border-l-8 bg-slate-50 p-4", d.status === "concluida" ? "border-emerald-500" : d.status === "cancelada" ? "border-slate-300 opacity-70" : "border-amber-500")}>
            <div className="flex-1">
              <div className={cn("text-lg font-medium", d.status === "cancelada" && "line-through")}>{d.text}</div>
              <div className="text-sm text-slate-600">
                {d.owner_name ?? "—"} · prazo {dmy(d.due_date)} · <b>{ST[d.status]}</b>
              </div>
            </div>
            {canEdit && (
              <div className="flex gap-2">
                {(["concluida", "cancelada", "aberta"] as const)
                  .filter((s) => s !== d.status)
                  .map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant={s === "concluida" ? "default" : "outline"}
                      disabled={busy === d.id}
                      onClick={async () => {
                        setBusy(d.id);
                        const nd = await patch(d.id, { status: s });
                        setBusy(null);
                        if (nd) setDecisions(decisions.map((x) => (x.id === d.id ? nd : x)));
                      }}
                    >
                      {s === "concluida" ? <Check /> : s === "cancelada" ? <X /> : null} {s === "concluida" ? "Concluída" : s === "cancelada" ? "Cancelada" : "Reabrir"}
                    </Button>
                  ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export function MeetingMode({ model, previous, current, canEdit, week, prevLabel }: { model: ReportModel; previous: Decision[]; current: Decision[]; canEdit: boolean; week: string; prevLabel: string }) {
  const total = model.pages.length + 1;
  const [i, setI] = useState(0);
  const [prev, setPrev] = useState(previous);
  const [cur, setCur] = useState(current);
  const [panel, setPanel] = useState(true);
  const [closing, setClosing] = useState(false);
  const [form, setForm] = useState({ text: "", ownerName: "", dueDate: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const go = useCallback((d: number) => setI((x) => Math.min(total - 1, Math.max(0, x + d))), [total]);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        go(1);
      }
      if (e.key === "ArrowLeft" || e.key === "PageUp") go(-1);
      if (e.key === "Home") setI(0);
      if (e.key === "End") setI(total - 1);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [go, total]);

  useLayoutEffect(() => {
    const fit = () => {
      const el = stage.current;
      if (!el) return;
      const w = 285 * 3.7795;
      const h = 198 * 3.7795;
      setScale(Math.min((el.clientWidth - 24) / w, (el.clientHeight - 24) / h));
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (stage.current) ro.observe(stage.current);
    return () => ro.disconnect();
  }, [panel]);

  async function addDecision(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const r = await fetch("/api/decisoes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ weekStart: week, text: form.text, ownerName: form.ownerName || null, dueDate: form.dueDate || null }) });
    const d = await r.json().catch(() => ({}));
    setSaving(false);
    if (!r.ok) return setError(d.error ?? "Não foi possível gravar.");
    setCur((x) => [...x, d.decision]);
    setForm({ text: "", ownerName: "", dueDate: "" });
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-slate-900 text-white">
      <header className="flex items-center gap-3 border-b border-slate-700 px-4 py-2 text-sm">
        <span className="font-semibold">Modo reunião</span>
        <span className="text-slate-400">{model.weekLabel}</span>
        <span className="rounded bg-amber-400 px-1.5 text-xs font-semibold text-amber-950">Dados simulados</span>
        <span className="flex-1" />
        <span className="tabular-nums text-slate-300">
          {i + 1} / {total}
        </span>
        <Button size="sm" variant="secondary" onClick={() => setPanel((p) => !p)}>
          {panel ? <PanelRightClose /> : <PanelRightOpen />} Decisões ({cur.length})
        </Button>
        {canEdit && (
          <Button size="sm" onClick={() => setClosing(true)}>
            <ClipboardList /> Encerrar reunião
          </Button>
        )}
        <Button asChild size="sm" variant="ghost" className="text-white hover:bg-slate-700 hover:text-white">
          <Link href="/relatorios">
            <X /> Sair
          </Link>
        </Button>
      </header>
      <div className="flex min-h-0 flex-1">
        <div ref={stage} className="relative flex min-w-0 flex-1 items-center justify-center overflow-hidden">
          <div style={{ transform: `scale(${scale})`, transformOrigin: "center" }} className="text-slate-900 shadow-2xl">
            {i === 0 ? <PreviousSlide decisions={prev} setDecisions={setPrev} canEdit={canEdit} prevLabel={prevLabel} /> : <ReportPageView page={model.pages[i - 1]} model={model} variant="slide" />}
          </div>
          <button type="button" aria-label="Anterior" onClick={() => go(-1)} disabled={i === 0} className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-slate-800/80 p-2 disabled:opacity-30">
            <ChevronLeft />
          </button>
          <button type="button" aria-label="Próximo" onClick={() => go(1)} disabled={i === total - 1} className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-slate-800/80 p-2 disabled:opacity-30">
            <ChevronRight />
          </button>
          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
            {Array.from({ length: total }, (_, k) => (
              <button key={k} type="button" aria-label={`Slide ${k + 1}`} onClick={() => setI(k)} className={cn("size-2 rounded-full", k === i ? "bg-white" : "bg-slate-600")} />
            ))}
          </div>
        </div>
        {panel && (
          <aside className="flex w-80 shrink-0 flex-col border-l border-slate-700 bg-slate-800">
            <div className="border-b border-slate-700 p-3 text-sm font-semibold">Decisões desta reunião</div>
            <div className="flex-1 space-y-2 overflow-y-auto p-3">
              {cur.length === 0 && <p className="text-xs text-slate-400">Nenhuma decisão registrada ainda.</p>}
              {cur.map((d) => (
                <div key={d.id} className="rounded bg-slate-700 p-2 text-sm">
                  <div>{d.text}</div>
                  <div className="text-xs text-slate-300">
                    {d.owner_name ?? "—"} · prazo {dmy(d.due_date)}
                  </div>
                </div>
              ))}
            </div>
            {canEdit ? (
              <form onSubmit={addDecision} className="space-y-2 border-t border-slate-700 p-3 text-sm">
                <textarea required value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} placeholder="Decisão (o que será feito)" aria-label="Decisão" rows={3} className="w-full rounded bg-slate-900 p-2 text-white placeholder:text-slate-500" />
                <input value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} placeholder="Responsável" aria-label="Responsável" className="w-full rounded bg-slate-900 p-2 text-white placeholder:text-slate-500" />
                <label className="block text-xs text-slate-400">
                  Prazo
                  <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className="mt-1 w-full rounded bg-slate-900 p-2 text-white [color-scheme:dark]" />
                </label>
                {error && <p className="text-xs text-red-300">{error}</p>}
                <Button type="submit" size="sm" disabled={saving} className="w-full">
                  {saving && <Loader2 className="animate-spin" />} Registrar decisão
                </Button>
              </form>
            ) : (
              <p className="border-t border-slate-700 p-3 text-xs text-slate-400">Seu perfil acompanha a reunião sem registrar decisões.</p>
            )}
          </aside>
        )}
      </div>
      {closing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 print:static print:bg-white">
          <div className="meeting-summary w-[720px] max-w-[95vw] rounded-xl bg-white p-6 text-slate-900 print:w-full print:shadow-none">
            <div className="mb-1 text-xs text-slate-500">
              {model.farmName} · Dados simulados
            </div>
            <h2 className="text-xl font-semibold">Decisões da reunião — {model.weekLabel.toLowerCase()}</h2>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-1">#</th>
                  <th>Decisão</th>
                  <th>Responsável</th>
                  <th>Prazo</th>
                </tr>
              </thead>
              <tbody>
                {cur.map((d, k) => (
                  <tr key={d.id} className="border-b">
                    <td className="py-1.5 pr-2">{k + 1}</td>
                    <td>{d.text}</td>
                    <td>{d.owner_name ?? "—"}</td>
                    <td>{dmy(d.due_date)}</td>
                  </tr>
                ))}
                {cur.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-2 text-slate-500">
                      Nenhuma decisão registrada nesta reunião.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-slate-500">Decisões da reunião anterior: {prev.filter((d) => d.status === "concluida").length} concluída(s), {prev.filter((d) => d.status === "cancelada").length} cancelada(s), {prev.filter((d) => d.status === "aberta").length} em aberto.</p>
            <div className="no-print mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setClosing(false)}>
                Voltar à reunião
              </Button>
              <Button onClick={() => window.print()}>
                <Printer /> Imprimir lista
              </Button>
              <Button asChild variant="secondary">
                <Link href="/relatorios">Concluir</Link>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
