"use client";
/** Painel de demonstração (Parte 16.1): cada botão grava um cenário e mostra o alerta esperado em segundos. */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, Droplets, Eraser, Loader2, PauseCircle, Skull, Thermometer } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Log {
  at: string;
  text: string;
  alerts: Array<{ id: string; title: string; rule: string }>;
  ms: number | null;
  ok: boolean;
}

const ACTIONS = [
  { key: "bebedouro", label: "Falha de bebedouro agora", icon: Droplets, line: "Grava a água de hoje: normal até 07h e depois 40% abaixo do normal para o horário.", expect: "A08h em até 10 s, com notificação" },
  { key: "temperatura", label: "Pico de temperatura agora", icon: Thermometer, line: "Grava temperatura interna de 33 a 35 °C nas últimas 3 horas.", expect: "A11" },
  { key: "esteira", label: "Esteira parada", icon: PauseCircle, line: "Grava mensagens do contador por minuto: 60 minutos normais e os últimos 25 minutos sem ovos.", expect: "A02 (avaliada entre 06h e 16h)" },
] as const;

export function DemoPanel({ houses }: { houses: string[] }) {
  const router = useRouter();
  const [house, setHouse] = useState(houses.includes("P004") ? "P004" : houses[0]);
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<Log[]>([]);
  const add = (l: Log) => setLog((x) => [l, ...x].slice(0, 12));

  async function run(acao: string) {
    setBusy(acao);
    const r = await fetch("/api/demo/cenario", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao, galpao: house }) });
    const d = await r.json().catch(() => ({}));
    const ms = typeof d.ms === "number" ? d.ms : null;
    setBusy(null);
    add({ at: new Date().toLocaleTimeString("pt-BR"), text: r.ok ? d.message : (d.error ?? "Falhou."), alerts: d.alerts ?? [], ms, ok: r.ok });
    router.refresh();
  }

  async function clear() {
    if (!confirm("Apagar todos os dados e alertas ao vivo (e os apontamentos de hoje do campo)?")) return;
    setBusy("limpar");
    const r = await fetch("/api/demo/limpar", { method: "POST" });
    const d = await r.json().catch(() => ({}));
    setBusy(null);
    add({ at: new Date().toLocaleTimeString("pt-BR"), text: r.ok ? `Cenários ao vivo apagados: ${Object.entries(d.counts ?? {}).map(([k, v]) => `${v} ${k}`).join(", ")}. Dia recalculado.` : (d.error ?? "Falhou."), alerts: [], ms: d.ms ?? null, ok: r.ok });
    router.refresh();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
      <div className="space-y-3">
        <div className="flex items-center gap-2 rounded-xl border bg-white p-3 text-sm">
          <span className="font-medium">Galpão:</span>
          <div className="flex flex-wrap gap-1.5">
            {houses.map((h) => (
              <button key={h} type="button" onClick={() => setHouse(h)} className={`rounded-full border px-3 py-1 ${house === h ? "border-emerald-600 bg-emerald-600 text-white" : "bg-white"}`}>
                {h}
              </button>
            ))}
          </div>
        </div>
        {ACTIONS.map((a) => (
          <div key={a.key} className="flex flex-wrap items-center gap-3 rounded-xl border bg-white p-3">
            <a.icon className="size-6 text-emerald-700" />
            <div className="min-w-60 flex-1">
              <div className="font-semibold">{a.label}</div>
              <div className="text-xs text-slate-600">{a.line}</div>
              <div className="text-xs text-slate-500">Alerta esperado: {a.expect}</div>
            </div>
            <Button onClick={() => run(a.key)} disabled={!!busy}>
              {busy === a.key && <Loader2 className="animate-spin" />} Rodar no {house}
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-white p-3">
          <Skull className="size-6 text-emerald-700" />
          <div className="min-w-60 flex-1">
            <div className="font-semibold">Mortalidade alta hoje</div>
            <div className="text-xs text-slate-600">Abre o app de campo já no galpão escolhido; registre, por exemplo, 150 mortes.</div>
            <div className="text-xs text-slate-500">Alerta esperado: A06 ao registrar</div>
          </div>
          <Button asChild variant="outline">
            <Link href={`/campo/${house}`}>Abrir o campo no {house}</Link>
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-white p-3">
          <Eraser className="size-6 text-red-700" />
          <div className="min-w-60 flex-1">
            <div className="font-semibold">Limpar cenários ao vivo</div>
            <div className="text-xs text-slate-600">Apaga tudo com origem “ao vivo” (dados e alertas), os apontamentos de hoje do campo e recalcula o dia.</div>
          </div>
          <Button variant="destructive" onClick={clear} disabled={!!busy}>
            {busy === "limpar" && <Loader2 className="animate-spin" />} Limpar
          </Button>
        </div>
      </div>
      <div className="rounded-xl border bg-white p-3">
        <div className="mb-2 text-sm font-semibold">O que aconteceu</div>
        {log.length === 0 && <p className="text-xs text-slate-500">Rode um cenário; o alerta aparece aqui, no sino e na central de alertas.</p>}
        <ul className="space-y-2">
          {log.map((l, i) => (
            <li key={i} className={`rounded border-l-4 p-2 text-sm ${l.ok ? "border-emerald-500" : "border-red-500"}`}>
              <div className="text-xs text-slate-500">
                {l.at}
                {l.ms != null ? ` · ${(l.ms / 1000).toFixed(1).replace(".", ",")} s` : ""}
              </div>
              <div>{l.text}</div>
              {l.alerts.map((a) => (
                <Link key={a.id} href={`/alertas/${a.id}`} className="mt-1 flex items-center gap-1 text-red-700 underline">
                  <AlertTriangle className="size-3.5" /> {a.rule}: {a.title}
                </Link>
              ))}
              {l.ok && l.alerts.length === 0 && l.text.startsWith("Grava") && <div className="text-xs text-slate-500">Nenhum alerta novo (pode já haver um aberto para a mesma regra e galpão).</div>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
