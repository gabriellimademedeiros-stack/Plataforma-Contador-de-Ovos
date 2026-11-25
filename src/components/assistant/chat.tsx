"use client";
/**
 * Conversa com o assistente (Parte 13.4): usada no painel lateral e na página cheia /assistente.
 * Streaming nos dois modos (com IA e reserva), progresso das ferramentas em linguagem simples, markdown,
 * gráficos de gerar_grafico, cartão de confirmação de preparar_evento, "Como calculei", copiar e útil/não útil.
 */
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot, Check, ChevronDown, ChevronRight, Copy, Loader2, Send, Square, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { EChart } from "@/components/charts/echart";
import type { ChartSpec } from "@/components/charts/types";
import { toolLabel } from "@/assistant/labels";
import { cn } from "@/lib/utils";

export type ChatContext = Record<string, unknown> | null;

interface ToolView {
  id: string;
  tool: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  done: boolean;
}

interface Meta {
  conversationId?: string;
  messageId?: string;
  mode?: "ia" | "reserva";
  limited?: boolean;
}

function toolsOf(m: UIMessage): ToolView[] {
  const out: ToolView[] = [];
  for (const p of m.parts as Array<Record<string, unknown>>) {
    const type = String(p.type);
    if (type.startsWith("tool-") || type === "dynamic-tool") {
      const tool = type === "dynamic-tool" ? String(p.toolName) : type.slice(5);
      out.push({ id: String(p.toolCallId), tool, input: (p.input ?? {}) as Record<string, unknown>, output: p.output as Record<string, unknown> | undefined, done: p.state === "output-available" || p.state === "output-error" });
    }
    if (type === "data-history-tools") {
      for (const [i, t] of ((p.data as Array<{ tool: string; input: Record<string, unknown> }>) ?? []).entries()) out.push({ id: `h${i}`, tool: t.tool, input: t.input ?? {}, done: true });
    }
  }
  return out;
}

const textOf = (m: UIMessage) => m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
const metaOf = (m: UIMessage): Meta => (m.parts.find((p) => p.type === "data-meta") as { data?: Meta } | undefined)?.data ?? {};

function Markdown({ text }: { text: string }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed [&_strong]:font-semibold [&_a]:text-emerald-700 [&_a]:underline">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          table: (p) => (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs" {...p} />
            </div>
          ),
          th: (p) => <th className="whitespace-nowrap border-b bg-slate-50 px-2 py-1 text-left font-semibold" {...p} />,
          td: (p) => <td className="border-b px-2 py-1 align-top tabular-nums" {...p} />,
          ul: (p) => <ul className="list-disc space-y-0.5 pl-5" {...p} />,
          ol: (p) => <ol className="list-decimal space-y-0.5 pl-5" {...p} />,
          p: (p) => <p {...p} />,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

function periodOf(t: ToolView): string | null {
  const per = (t.output?.periodo ?? null) as { inicio?: string; fim?: string } | null;
  const a = per?.inicio ?? (t.input.inicio as string | undefined);
  const b = per?.fim ?? (t.input.fim as string | undefined);
  const f = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
  if (a && b && /^\d{4}-\d{2}-\d{2}/.test(a) && /^\d{4}-\d{2}-\d{2}/.test(b)) return `${f(a)} a ${f(b)}`;
  return null;
}

function HowCalculated({ tools }: { tools: ToolView[] }) {
  const [open, setOpen] = useState(false);
  if (!tools.length) return null;
  return (
    <div className="mt-2 rounded border bg-slate-50 text-xs">
      <button type="button" className="flex w-full items-center gap-1 px-2 py-1 text-left font-medium text-slate-600" onClick={() => setOpen((v) => !v)}>
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />} Como calculei ({tools.length} {tools.length === 1 ? "ferramenta" : "ferramentas"})
      </button>
      {open && (
        <ol className="space-y-1.5 px-3 pb-2">
          {tools.map((t) => (
            <li key={t.id}>
              <div className="font-mono font-semibold">{t.tool}</div>
              <div className="break-all text-slate-600">parâmetros: {JSON.stringify(t.input)}</div>
              {periodOf(t) && <div className="text-slate-600">período: {periodOf(t)}</div>}
              {typeof t.output?.fonte === "string" && <div className="text-slate-600">fonte: {t.output.fonte}</div>}
              {typeof t.output?.erro === "string" && <div className="text-red-700">erro: {t.output.erro}</div>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

interface Draft {
  typeCode: string;
  typeName: string;
  houses: string[];
  title: string;
  startsAt: string;
  endsAt: string | null;
  description: string | null;
  certainty: string;
  details: Record<string, unknown>;
}

function EventConfirmCard({ draft, canRegister }: { draft: Draft; canRegister: boolean }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "cancel">("idle");
  const [error, setError] = useState<string | null>(null);
  const [eventId, setEventId] = useState<string | null>(null);
  const when = `${draft.startsAt.slice(8, 10)}/${draft.startsAt.slice(5, 7)}/${draft.startsAt.slice(0, 4)} às ${draft.startsAt.slice(11, 16)}`;
  async function confirm() {
    setState("busy");
    setError(null);
    try {
      const r = await fetch("/api/eventos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ typeCode: draft.typeCode, houses: draft.houses, title: draft.title, startsAt: draft.startsAt, endsAt: draft.endsAt, description: draft.description, certainty: draft.certainty, details: draft.details, source: "assistente" }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Não foi possível registrar.");
      setEventId(d.id);
      setState("done");
    } catch (e) {
      setError((e as Error).message);
      setState("idle");
    }
  }
  return (
    <div className="mt-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm">
      <div className="mb-1 font-semibold">Confirmar registro de evento</div>
      <dl className="grid grid-cols-[90px_1fr] gap-x-2 gap-y-0.5 text-xs">
        <dt className="text-slate-500">Tipo</dt>
        <dd>
          {draft.typeName} <span className="font-mono text-slate-500">({draft.typeCode})</span>
        </dd>
        <dt className="text-slate-500">Galpão</dt>
        <dd>{draft.houses.join(", ")}</dd>
        <dt className="text-slate-500">Data</dt>
        <dd>{when}</dd>
        <dt className="text-slate-500">Título</dt>
        <dd>{draft.title}</dd>
        <dt className="text-slate-500">Certeza</dt>
        <dd>{draft.certainty}</dd>
      </dl>
      {state === "done" ? (
        <p className="mt-2 font-medium text-emerald-800">
          Registrado. Vou acompanhar os indicadores do {draft.houses.join(", ")} nos próximos 10 dias.{" "}
          {eventId && (
            <Link className="underline" href={`/eventos/${eventId}`}>
              Ver evento
            </Link>
          )}
        </p>
      ) : state === "cancel" ? (
        <p className="mt-2 text-slate-600">Registro cancelado. Nada foi gravado.</p>
      ) : !canRegister ? (
        <p className="mt-2 text-slate-600">Seu perfil não registra eventos.</p>
      ) : (
        <div className="mt-2 flex gap-2">
          <button type="button" disabled={state === "busy"} onClick={confirm} className="inline-flex items-center gap-1 rounded bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-60">
            {state === "busy" ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Confirmar registro
          </button>
          <button type="button" onClick={() => setState("cancel")} className="rounded border bg-white px-3 py-1.5 text-xs">
            Cancelar
          </button>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}

function Feedback({ messageId, text }: { messageId: string; text: string }) {
  const [fb, setFb] = useState<"util" | "nao_util" | null>(null);
  const [copied, setCopied] = useState(false);
  async function send(v: "util" | "nao_util") {
    setFb(v);
    await fetch("/api/assistente/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId, feedback: v }) }).catch(() => {});
  }
  return (
    <div className="mt-1 flex items-center gap-1 text-slate-400">
      <button
        type="button"
        title="Copiar"
        className="rounded p-1 hover:bg-slate-100 hover:text-slate-700"
        onClick={() => {
          navigator.clipboard?.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
      <button type="button" title="Útil" onClick={() => send("util")} className={cn("rounded p-1 hover:bg-slate-100", fb === "util" && "text-emerald-700")}>
        <ThumbsUp className="size-3.5" />
      </button>
      <button type="button" title="Não útil" onClick={() => send("nao_util")} className={cn("rounded p-1 hover:bg-slate-100", fb === "nao_util" && "text-red-700")}>
        <ThumbsDown className="size-3.5" />
      </button>
      {fb && <span className="text-[11px]">Obrigado pelo retorno.</span>}
    </div>
  );
}

function AssistantMessage({ m, streaming, canRegister }: { m: UIMessage; streaming: boolean; canRegister: boolean }) {
  const tools = toolsOf(m);
  const text = textOf(m);
  const meta = metaOf(m);
  const running = tools.filter((t) => !t.done);
  const charts = tools.filter((t) => t.tool === "gerar_grafico" && t.output && Array.isArray(t.output.graficos)).flatMap((t) => t.output!.graficos as ChartSpec[]);
  const drafts = tools.filter((t) => t.tool === "preparar_evento" && t.output?.rascunho).map((t) => ({ id: t.id, draft: t.output!.rascunho as Draft }));
  return (
    <div className="flex gap-2">
      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-800">
        <Bot className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        {meta.mode === "reserva" && <span className="mb-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">Modo demonstração sem IA</span>}
        {streaming &&
          running.map((t) => (
            <div key={t.id} className="flex items-center gap-1.5 text-xs text-slate-500">
              <Loader2 className="size-3 animate-spin" /> {toolLabel(t.tool, t.input)}
            </div>
          ))}
        {streaming && !text && !running.length && (
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Loader2 className="size-3 animate-spin" /> Pensando…
          </div>
        )}
        {text && <Markdown text={text} />}
        {charts.map((s, i) => (
          <div key={i} className="mt-2 rounded border bg-white p-1">
            <EChart spec={s} height={220} hideToolbar />
          </div>
        ))}
        {drafts.map((d) => (
          <EventConfirmCard key={d.id} draft={d.draft} canRegister={canRegister} />
        ))}
        {!streaming && <HowCalculated tools={tools} />}
        {!streaming && text && <Feedback messageId={meta.messageId ?? m.id} text={text} />}
      </div>
    </div>
  );
}

export function contextLabel(c: ChatContext): string | null {
  if (!c) return null;
  const parts: string[] = [];
  if (typeof c.grafico === "string") parts.push(`gráfico "${c.grafico}"`);
  if (typeof c.galpao === "string") parts.push(c.galpao);
  else if (Array.isArray(c.galpoes)) parts.push((c.galpoes as string[]).join(", "));
  if (typeof c.alerta === "string" && typeof c.galpao !== "string") parts.push("alerta");
  if (typeof c.tela === "string" && !parts.length) parts.push(c.tela);
  const per = c.periodo as { inicio?: string; fim?: string } | string | undefined;
  if (typeof per === "string") parts.push(per);
  else if (per?.inicio && per?.fim) parts.push(`${per.inicio.slice(8, 10)}/${per.inicio.slice(5, 7)} a ${per.fim.slice(8, 10)}/${per.fim.slice(5, 7)}`);
  return parts.length ? parts.join(" · ") : null;
}

export interface AssistantChatProps {
  suggestions: string[];
  canRegister: boolean;
  context: ChatContext;
  onClearContext?: () => void;
  /** Mensagens iniciais e id da conversa (para trocar de conversa, remonte o componente com outra key). */
  initialMessages?: UIMessage[];
  conversationId?: string | null;
  onConversation?: (id: string) => void;
  prefill?: { text: string; nonce: number } | null;
  aiEnabled: boolean;
  compact?: boolean;
}

export function AssistantChat(p: AssistantChatProps) {
  const convRef = useRef<string | null>(p.conversationId ?? null);
  const ctxRef = useRef<ChatContext>(p.context);
  useEffect(() => {
    ctxRef.current = p.context;
  }, [p.context]);
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/assistente" }), []);
  const { messages, sendMessage, status, stop, error } = useChat({
    transport,
    messages: p.initialMessages ?? [],
    onData: (part: { type: string; data?: unknown }) => {
      if (part.type === "data-meta") {
        const d = part.data as Meta;
        if (d.conversationId && d.conversationId !== convRef.current) {
          convRef.current = d.conversationId;
          p.onConversation?.(d.conversationId);
        }
      }
    },
  } as never);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const busy = status === "submitted" || status === "streaming";

  // pergunta pré-preenchida (botão "Perguntar à IA sobre este gráfico"): ajusta o estado quando a prop muda
  const [seenPrefill, setSeenPrefill] = useState<number | null>(null);
  if (p.prefill && p.prefill.nonce !== seenPrefill) {
    setSeenPrefill(p.prefill.nonce);
    setInput(p.prefill.text);
  }
  useEffect(() => {
    if (p.prefill) inputRef.current?.focus();
  }, [p.prefill]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, status]);

  function ask(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    setInput("");
    sendMessage({ text: t }, { body: { conversationId: convRef.current, context: ctxRef.current } });
  }

  const ctxLabel = contextLabel(p.context);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        {messages.length === 0 && (
          <div>
            <p className="mb-2 text-sm text-slate-600">
              Pergunte sobre produção, qualidade, alertas, previsões ou finanças. Eu só cito números calculados pela plataforma e mostro como calculei.
            </p>
            {!p.aiEnabled && <p className="mb-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">Modo demonstração sem IA: respondo às perguntas abaixo (e variações próximas) com os números reais da plataforma.</p>}
            <div className="flex flex-col gap-1.5">
              {p.suggestions.map((s) => (
                <button key={s} type="button" onClick={() => ask(s)} className="rounded-lg border bg-white px-3 py-2 text-left text-sm hover:border-emerald-400 hover:bg-emerald-50">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-emerald-700 px-3 py-2 text-sm text-white">{textOf(m)}</div>
            </div>
          ) : (
            <AssistantMessage key={m.id} m={m} streaming={busy && i === messages.length - 1} canRegister={p.canRegister} />
          ),
        )}
        {status === "submitted" && messages[messages.length - 1]?.role === "user" && (
          <div className="flex items-center gap-1.5 pl-9 text-xs text-slate-500">
            <Loader2 className="size-3 animate-spin" /> Pensando…
          </div>
        )}
        {error && <p className="rounded bg-red-50 px-2 py-1 text-sm text-red-700">Não consegui responder agora. Tente de novo em instantes.</p>}
        <div ref={endRef} />
      </div>
      <div className="border-t bg-white p-2">
        {ctxLabel && (
          <div className="mb-1.5 flex items-center gap-1 text-xs text-slate-600">
            <span className="rounded bg-slate-100 px-1.5 py-0.5">Contexto: {ctxLabel}</span>
            {p.onClearContext && (
              <button type="button" title="Limpar contexto" onClick={p.onClearContext} className="rounded p-0.5 hover:bg-slate-100">
                <X className="size-3.5" />
              </button>
            )}
          </div>
        )}
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
        >
          <textarea
            ref={inputRef}
            value={input}
            rows={p.compact ? 2 : 3}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask(input);
              }
            }}
            placeholder="Escreva sua pergunta…"
            aria-label="Pergunta para o assistente"
            className="min-h-10 flex-1 resize-none rounded-md border px-2 py-1.5 text-sm outline-none focus:border-emerald-500"
          />
          {busy ? (
            <button type="button" onClick={() => stop()} title="Parar" className="rounded-md border p-2">
              <Square className="size-4" />
            </button>
          ) : (
            <button type="submit" title="Enviar" disabled={!input.trim()} className="rounded-md bg-emerald-700 p-2 text-white disabled:opacity-50">
              <Send className="size-4" />
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
