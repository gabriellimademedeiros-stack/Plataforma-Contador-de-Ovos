"use client";
/** Página cheia /assistente com o histórico de conversas à esquerda (Parte 13.4). */
import type { UIMessage } from "ai";
import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquare, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { AssistantChat } from "./chat";

interface Conv {
  id: string;
  title: string;
  created_at: string;
}
interface StoredMsg {
  id: string;
  role: string;
  content: { text?: string; tools?: Array<{ tool: string; input: Record<string, unknown> }> };
  mode: "ia" | "reserva";
}

function toUI(rows: StoredMsg[]): UIMessage[] {
  return rows.map((r) => ({
    id: r.id,
    role: r.role === "user" ? "user" : "assistant",
    parts: [
      ...(r.role === "assistant" ? [{ type: "data-meta", data: { messageId: r.id, mode: r.mode } }, { type: "data-history-tools", data: r.content.tools ?? [] }] : []),
      { type: "text", text: r.content.text ?? "" },
    ],
  })) as UIMessage[];
}

const fmt = (iso: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Fortaleza" }).format(new Date(iso));

export function AssistantFullPage({ suggestions, canRegister, aiEnabled }: { suggestions: string[]; canRegister: boolean; aiEnabled: boolean }) {
  const [convs, setConvs] = useState<Conv[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [initial, setInitial] = useState<UIMessage[]>([]);
  const [chatKey, setChatKey] = useState("nova-0");

  const reload = useCallback(async () => {
    const r = await fetch("/api/assistente/conversas");
    if (r.ok) setConvs((await r.json()).conversations ?? []);
  }, []);
  useEffect(() => {
    let alive = true;
    fetch("/api/assistente/conversas")
      .then((r) => (r.ok ? r.json() : { conversations: [] }))
      .then((d) => alive && setConvs(d.conversations ?? []));
    return () => {
      alive = false;
    };
  }, []);
  const seq = useRef(0);

  async function open(id: string) {
    const r = await fetch(`/api/assistente/conversas?id=${id}`);
    if (!r.ok) return;
    setInitial(toUI((await r.json()).messages ?? []));
    setSelected(id);
    setChatKey(`c-${id}-${++seq.current}`);
  }
  function novo() {
    setSelected(null);
    setInitial([]);
    setChatKey(`nova-${++seq.current}`);
  }

  return (
    <div className="-m-3 flex h-[calc(100vh-7.5rem)] md:-m-5">
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-white md:flex">
        <div className="border-b p-2">
          <button type="button" onClick={novo} className="flex w-full items-center justify-center gap-1.5 rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800">
            <Plus className="size-4" /> Nova conversa
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-1">
          {convs.length === 0 && <p className="p-3 text-xs text-slate-500">Nenhuma conversa ainda.</p>}
          {convs.map((c) => (
            <button key={c.id} type="button" onClick={() => open(c.id)} className={cn("flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-slate-100", selected === c.id && "bg-emerald-50")}>
              <MessageSquare className="mt-0.5 size-3.5 shrink-0 text-slate-400" />
              <span className="min-w-0">
                <span className="line-clamp-2">{c.title}</span>
                <span className="text-[11px] text-slate-500">{fmt(c.created_at)}</span>
              </span>
            </button>
          ))}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b bg-white px-4 py-2">
          <div>
            <h1 className="font-semibold">Assistente</h1>
            <p className="text-xs text-slate-500">{aiEnabled ? "Com IA: perguntas livres, sempre com números das ferramentas da plataforma." : "Modo demonstração sem IA: responde às 12 perguntas sugeridas e variações próximas, com números reais."}</p>
          </div>
          <button type="button" onClick={novo} className="rounded border px-2 py-1 text-xs md:hidden">
            Nova conversa
          </button>
        </div>
        <div className="mx-auto min-h-0 w-full max-w-3xl flex-1">
          <AssistantChat
            key={chatKey}
            suggestions={suggestions}
            canRegister={canRegister}
            context={{ tela: "Assistente" }}
            initialMessages={initial}
            conversationId={selected}
            onConversation={(id) => {
              setSelected(id);
              reload();
            }}
            aiEnabled={aiEnabled}
          />
        </div>
      </div>
    </div>
  );
}
