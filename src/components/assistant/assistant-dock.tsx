"use client";
/**
 * Painel lateral do assistente (Parte 13.4): botão fixo "Assistente" no canto inferior direito, atalho Ctrl+K,
 * abre com o contexto da tela (com opção de limpar) e atende ao botão "Perguntar à IA sobre este gráfico".
 */
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Maximize2, Sparkles, X } from "lucide-react";
import { PERIOD_OPTIONS } from "@/lib/filters";
import { filterSuggestions } from "@/assistant/suggestions";
import { AssistantChat, type ChatContext } from "./chat";

const SCREENS: Record<string, string> = {
  "": "Início",
  granja: "Granja",
  producao: "Produção",
  qualidade: "Qualidade do ovo",
  laboratorio: "Laboratório",
  sanidade: "Sanidade",
  nutricao: "Nutrição",
  ambiencia: "Ambiência",
  financeiro: "Financeiro",
  eventos: "Eventos",
  alertas: "Alertas",
  comparativos: "Comparativos",
  relatorios: "Relatórios",
  campo: "Campo",
};

function screenContext(pathname: string, sp: URLSearchParams): ChatContext {
  const seg = pathname.split("/").filter(Boolean);
  const ctx: Record<string, unknown> = { tela: SCREENS[seg[0] ?? ""] ?? seg[0] };
  if (seg[0] === "galpoes" && seg[1]) {
    ctx.tela = `Galpão ${seg[1].toUpperCase()}`;
    ctx.galpao = seg[1].toUpperCase();
  }
  if (seg[0] === "campo" && seg[1]) ctx.galpao = seg[1].toUpperCase();
  if (seg[0] === "alertas" && seg[1]) ctx.alerta = seg[1];
  if (seg[0] === "eventos" && seg[1] && seg[1] !== "novo") ctx.evento = seg[1];
  const g = sp.get("galpao");
  if (g && !ctx.galpao) ctx.galpao = g.toUpperCase();
  const per = sp.get("periodo");
  const opt = PERIOD_OPTIONS.find((o) => o.key === per);
  if (opt) ctx.periodo = `últimos ${opt.label}`;
  else if (per === "custom" && sp.get("de") && sp.get("ate")) ctx.periodo = { inicio: sp.get("de"), fim: sp.get("ate") };
  else if (ctx.galpao) ctx.periodo = "últimos 30 dias";
  return ctx;
}

export function AssistantDock({ canSeeFinance, houseCodes = [], canRegister = true, aiEnabled = false }: { canSeeFinance: boolean; houseCodes?: string[]; canRegister?: boolean; aiEnabled?: boolean }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);
  const [override, setOverride] = useState<{ key: string; ctx: ChatContext } | null>(null);
  const [prefill, setPrefill] = useState<{ text: string; nonce: number } | null>(null);
  const [chatKey, setChatKey] = useState(0);
  const spKey = sp.toString();
  const suggestions = useMemo(() => filterSuggestions(houseCodes, canSeeFinance, canRegister), [houseCodes, canSeeFinance, canRegister]);

  // contexto acompanha a tela atual; um contexto escolhido (gráfico) ou limpo vale só para a tela em que foi definido
  const screenKey = `${pathname}?${spKey}`;
  const screenCtx = useMemo(() => screenContext(pathname, new URLSearchParams(spKey)), [pathname, spKey]);
  const context: ChatContext = override && override.key === screenKey ? override.ctx : screenCtx;
  const setContext = (ctx: ChatContext) => setOverride({ key: screenKey, ctx });

  const toggle = useCallback(() => setOpen((v) => !v), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggle();
      }
      if (e.key === "Escape") setOpen(false);
    };
    const onAsk = (e: Event) => {
      const d = (e as CustomEvent<{ question: string; context?: Record<string, unknown> }>).detail;
      setOverride({ key: `${pathname}?${spKey}`, ctx: { ...screenContext(pathname, new URLSearchParams(spKey)), ...(d.context ?? {}) } });
      setPrefill({ text: d.question, nonce: Date.now() });
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("ovos:ask", onAsk);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("ovos:ask", onAsk);
    };
  }, [toggle, pathname, spKey]);

  if (pathname.startsWith("/assistente") || pathname.startsWith("/imprimir")) return null;

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed right-4 bottom-4 z-40 inline-flex items-center gap-2 rounded-full bg-emerald-700 px-4 py-3 text-sm font-medium text-white shadow-lg hover:bg-emerald-800 print:hidden"
          title="Assistente (Ctrl+K)"
        >
          <Sparkles className="size-4" /> Assistente
        </button>
      )}
      {open && (
        <aside role="dialog" aria-label="Assistente" className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l bg-slate-50 shadow-2xl sm:w-[460px] print:hidden">
          <header className="flex items-center gap-2 border-b bg-white px-3 py-2">
            <Sparkles className="size-4 text-emerald-700" />
            <div className="flex-1">
              <div className="text-sm font-semibold">Assistente</div>
              <div className="text-[11px] text-slate-500">{aiEnabled ? "Com IA · dados simulados" : "Modo demonstração sem IA · dados simulados"}</div>
            </div>
            <button type="button" className="rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-100" onClick={() => setChatKey((k) => k + 1)} title="Nova conversa">
              Nova conversa
            </button>
            <Link href="/assistente" className="rounded p-1 text-slate-600 hover:bg-slate-100" title="Abrir em página cheia" onClick={() => setOpen(false)}>
              <Maximize2 className="size-4" />
            </Link>
            <button type="button" className="rounded p-1 text-slate-600 hover:bg-slate-100" onClick={() => setOpen(false)} title="Fechar (Esc)">
              <X className="size-4" />
            </button>
          </header>
          <div className="min-h-0 flex-1">
            <AssistantChat
              key={chatKey}
              suggestions={suggestions}
              canRegister={canRegister}
              context={context}
              onClearContext={() => setContext(null)}
              prefill={prefill}
              aiEnabled={aiEnabled}
              compact
            />
          </div>
        </aside>
      )}
    </>
  );
}
