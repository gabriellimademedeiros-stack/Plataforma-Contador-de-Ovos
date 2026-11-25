"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Download, Loader2, Presentation, Printer, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toCsv } from "@/components/charts/csv";
import type { RBlock, ReportModel } from "./types";

function tablesOf(blocks: RBlock[], page: string, out: Array<{ page: string; title?: string; columns: string[]; rows: string[][] }>) {
  for (const b of blocks) {
    if (b.type === "table") out.push({ page, title: b.title, columns: b.columns, rows: b.rows.map((r) => ("group" in r ? [r.group] : r.map((c) => c.v))) });
    if (b.type === "grid") tablesOf(b.blocks, page, out);
  }
}

/** CSV com todas as tabelas do relatório (uma após a outra), para abrir no Excel. */
export function reportCsv(model: ReportModel): string {
  const tables: Array<{ page: string; title?: string; columns: string[]; rows: string[][] }> = [];
  for (const p of model.pages) tablesOf(p.blocks, `${p.n}. ${p.title}`, tables);
  return tables.map((t) => `${t.page}${t.title ? ` — ${t.title}` : ""}\r\n${toCsv(t.columns, t.rows)}`).join("\r\n\r\n");
}

export function GenerateButton({ week, label = "Gerar agora", tipo = "ambos" }: { week?: string; label?: string; tipo?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const r = await fetch("/api/relatorios/gerar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo, semana: week ?? null }) });
          const d = await r.json().catch(() => ({}));
          setBusy(false);
          if (!r.ok) setError(d.error ?? "Não foi possível gerar.");
          else router.refresh();
        }}
      >
        {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />} {label}
      </Button>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </span>
  );
}

export function ReportToolbar({ model, kind, week, canGenerate }: { model: ReportModel; kind: string; week: string; canGenerate: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild size="sm" variant="outline">
        <Link href={`/relatorios/${kind}/${week}/imprimir`} target="_blank">
          <Printer /> Imprimir / Baixar PDF
        </Link>
      </Button>
      {kind === "semanal" && (
        <Button asChild size="sm" variant="outline">
          <Link href={`/reuniao/${week}`}>
            <Presentation /> Modo reunião
          </Link>
        </Button>
      )}
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          const blob = new Blob(["﻿" + reportCsv(model)], { type: "text/csv;charset=utf-8" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `relatorio-${kind}-${week}.csv`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 2000);
        }}
      >
        <Download /> Baixar CSV
      </Button>
      {canGenerate && <GenerateButton week={week} tipo={kind} label="Gerar de novo" />}
    </div>
  );
}

export function RewriteWithAI({ tipo, week }: { tipo: string; week: string }) {
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="rounded-xl border border-dashed bg-white p-3 text-sm">
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const r = await fetch("/api/relatorios/reescrever", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo, semana: week }) });
          const d = await r.json().catch(() => ({}));
          setBusy(false);
          if (r.ok) setText(d.text);
          else setError(d.error ?? "Não foi possível reescrever.");
        }}
      >
        {busy ? <Loader2 className="animate-spin" /> : null} Reescrever resumo com IA
      </Button>
      {error && <span className="ml-2 text-xs text-red-700">{error}</span>}
      {text && <p className="mt-2 whitespace-pre-wrap">{text}</p>}
      {text && <p className="mt-1 text-[11px] text-slate-500">Texto gerado pela IA a partir dos números do relatório; o retrato arquivado não muda.</p>}
    </div>
  );
}
