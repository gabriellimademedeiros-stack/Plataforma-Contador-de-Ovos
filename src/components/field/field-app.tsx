"use client";
/** App de campo do galpão (Parte 14.21): botões grandes, poucas palavras, ditado por voz e fila sem internet. */
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CheckCircle2, Droplets, Eye, Loader2, Mic, MicOff, Skull, Wheat, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { enqueue, flush, pending } from "./offline-queue";

type Kind = "mortalidade" | "evento" | "racao" | "agua" | "observacao";
const BTNS: Array<{ k: Kind; label: string; icon: React.ElementType; color: string }> = [
  { k: "mortalidade", label: "Mortalidade", icon: Skull, color: "bg-red-600" },
  { k: "evento", label: "Evento", icon: Zap, color: "bg-amber-600" },
  { k: "racao", label: "Ração", icon: Wheat, color: "bg-yellow-700" },
  { k: "agua", label: "Água", icon: Droplets, color: "bg-sky-600" },
  { k: "observacao", label: "Observação", icon: Eye, color: "bg-slate-600" },
];

interface SpeechRec {
  lang: string;
  interimResults: boolean;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  onend: () => void;
  onerror: () => void;
  start: () => void;
  stop: () => void;
}

function useSpeech(onText: (t: string) => void) {
  const [rec, setRec] = useState<SpeechRec | null>(null);
  const [on, setOn] = useState(false);
  const supported = typeof window !== "undefined" && ("webkitSpeechRecognition" in window || "SpeechRecognition" in window);
  function toggle() {
    if (on && rec) {
      rec.stop();
      return;
    }
    const W = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const C = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!C) return;
    const r = new C();
    r.lang = "pt-BR";
    r.interimResults = false;
    r.onresult = (e) => onText(Array.from(e.results).map((x) => x[0].transcript).join(" "));
    r.onend = () => setOn(false);
    r.onerror = () => setOn(false);
    r.start();
    setRec(r);
    setOn(true);
  }
  return { supported, on, toggle };
}

export function FieldApp({ house, flock, causes, eventTypes, today, aiEnabled }: { house: string; flock: string | null; causes: Array<{ code: string; label: string }>; eventTypes: Array<{ code: string; name: string }>; today: { deaths: number; feedKg: number | null; water: number | null }; aiEnabled: boolean }) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string; alerts?: Array<{ title: string }> } | null>(null);
  const [queued, setQueued] = useState(0);
  const [qtd, setQtd] = useState("");
  const [causa, setCausa] = useState("desconhecida");
  const [num, setNum] = useState("");
  const [texto, setTexto] = useState("");
  const [evento, setEvento] = useState(eventTypes[0]?.code ?? "");
  const [certeza, setCerteza] = useState("suspeito");
  const [interpreting, setInterpreting] = useState(false);

  useEffect(() => {
    const sync = async () => {
      const n = await flush().catch(() => 0);
      if (n) router.refresh();
      setQueued(await pending().catch(() => 0));
    };
    sync();
    window.addEventListener("online", sync);
    return () => window.removeEventListener("online", sync);
  }, [router]);

  const speech = useSpeech(async (t) => {
    setTexto((x) => (x ? `${x} ${t}` : t));
    if (kind === "evento") {
      setInterpreting(true);
      const r = await fetch("/api/campo/interpretar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto: t }) }).catch(() => null);
      setInterpreting(false);
      if (r?.ok) {
        const d = await r.json();
        if (d.evento) setEvento(d.evento);
        if (d.descricao) setTexto(d.descricao);
      }
    }
  });

  function reset() {
    setQtd("");
    setNum("");
    setTexto("");
    setCausa("desconhecida");
  }

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setResult(null);
    try {
      if (!navigator.onLine) throw new TypeError("offline");
      const r = await fetch("/api/campo/registro", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setResult({ ok: false, text: d.error ?? "Não foi possível registrar." });
      else {
        setResult({ ok: true, text: d.message ?? "Registrado ✓", alerts: d.alerts });
        reset();
        setKind(null);
        router.refresh();
      }
    } catch {
      await enqueue(body);
      setQueued(await pending());
      setResult({ ok: true, text: "Sem internet: o registro ficou guardado no aparelho e será enviado quando a conexão voltar." });
      reset();
      setKind(null);
    } finally {
      setBusy(false);
    }
  }

  const big = "h-16 w-full rounded-xl border-2 px-3 text-2xl";
  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-white p-3 text-sm">
        <div className="text-slate-500">Hoje no {house}{flock ? ` · lote ${flock}` : ""}</div>
        <div className="mt-1 flex flex-wrap gap-4 text-base">
          <span>
            Mortes: <b>{today.deaths}</b>
          </span>
          <span>
            Ração: <b>{today.feedKg != null ? `${today.feedKg} kg` : "—"}</b>
          </span>
          <span>
            Água: <b>{today.water != null ? `${today.water} L` : "—"}</b>
          </span>
        </div>
        {queued > 0 && <div className="mt-1 text-amber-700">{queued} registro(s) aguardando internet para enviar.</div>}
      </div>

      {result && (
        <div className={cn("rounded-xl border-2 p-4 text-lg", result.ok ? "border-emerald-500 bg-emerald-50 text-emerald-900" : "border-red-500 bg-red-50 text-red-900")}>
          <div className="flex items-start gap-2">
            {result.ok && <CheckCircle2 className="mt-1 size-6 shrink-0" />}
            <span>{result.text}</span>
          </div>
          {result.alerts && result.alerts.length > 0 && (
            <div className="mt-2 text-base text-red-800">
              Alerta aberto: {result.alerts.map((a) => a.title).join("; ")}
            </div>
          )}
        </div>
      )}

      {!kind ? (
        <div className="grid grid-cols-2 gap-3">
          {BTNS.map((b) => (
            <button key={b.k} type="button" onClick={() => { setKind(b.k); setResult(null); }} className={cn("flex h-28 flex-col items-center justify-center gap-1 rounded-2xl text-xl font-semibold text-white shadow active:scale-95", b.color, b.k === "observacao" && "col-span-2 h-20")}>
              <b.icon className="size-8" />
              {b.label}
            </button>
          ))}
        </div>
      ) : (
        <form
          className="space-y-4 rounded-2xl border bg-white p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (kind === "mortalidade") send({ tipo: "mortalidade", house, qtd: Number(qtd), causa });
            if (kind === "racao") send({ tipo: "racao", house, kg: Number(num.replace(",", ".")) });
            if (kind === "agua") send({ tipo: "agua", house, litros: Number(num.replace(",", ".")) });
            if (kind === "observacao") send({ tipo: "observacao", house, texto });
            if (kind === "evento") send({ tipo: "evento", house, evento, descricao: texto || null, certeza });
          }}
        >
          <div className="text-xl font-semibold">{BTNS.find((b) => b.k === kind)!.label}</div>
          {kind === "mortalidade" && (
            <>
              <label className="block text-lg">
                Quantas aves?
                <input className={big} inputMode="numeric" pattern="[0-9]*" required autoFocus value={qtd} onChange={(e) => setQtd(e.target.value.replace(/\D/g, ""))} />
              </label>
              <div>
                <div className="mb-1 text-lg">Causa provável</div>
                <div className="grid grid-cols-2 gap-2">
                  {causes.map((c) => (
                    <button key={c.code} type="button" onClick={() => setCausa(c.code)} className={cn("h-14 rounded-xl border-2 text-lg", causa === c.code ? "border-emerald-600 bg-emerald-50 font-semibold" : "bg-white")}>
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
          {(kind === "racao" || kind === "agua") && (
            <label className="block text-lg">
              {kind === "racao" ? "Quantos kg de ração foram distribuídos?" : "Leitura do hidrômetro do dia (litros)"}
              <input className={big} inputMode="decimal" required autoFocus value={num} onChange={(e) => setNum(e.target.value)} />
            </label>
          )}
          {kind === "evento" && (
            <>
              <div className="grid grid-cols-1 gap-2">
                {eventTypes.map((t) => (
                  <button key={t.code} type="button" onClick={() => setEvento(t.code)} className={cn("min-h-12 rounded-xl border-2 px-3 text-left text-base", evento === t.code ? "border-emerald-600 bg-emerald-50 font-semibold" : "bg-white")}>
                    {t.name}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                {(["suspeito", "provavel", "confirmado"] as const).map((c) => (
                  <button key={c} type="button" onClick={() => setCerteza(c)} className={cn("h-12 flex-1 rounded-xl border-2 text-base", certeza === c ? "border-emerald-600 bg-emerald-50 font-semibold" : "bg-white")}>
                    {c === "provavel" ? "provável" : c}
                  </button>
                ))}
              </div>
            </>
          )}
          {(kind === "evento" || kind === "observacao") && (
            <div>
              <div className="mb-1 flex items-center justify-between text-lg">
                <span>{kind === "evento" ? "O que aconteceu?" : "Observação"}</span>
                {speech.supported && (
                  <Button type="button" variant={speech.on ? "destructive" : "outline"} onClick={speech.toggle}>
                    {speech.on ? <MicOff /> : <Mic />} {speech.on ? "Parar" : "Falar"}
                  </Button>
                )}
              </div>
              <textarea className="min-h-28 w-full rounded-xl border-2 p-3 text-lg" required={kind === "observacao"} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={speech.supported ? "Escreva ou toque em Falar" : "Escreva aqui"} />
              {interpreting && <p className="text-sm text-slate-500">Entendendo o que foi dito…</p>}
              {kind === "evento" && speech.supported && <p className="text-xs text-slate-500">{aiEnabled ? "Com a IA, o texto ditado escolhe o tipo e resume a descrição; confira antes de registrar." : "O texto ditado escolhe o tipo pelas palavras-chave; confira antes de registrar."}</p>}
            </div>
          )}
          <div className="flex gap-2">
            <Button type="submit" size="xl" className="flex-1" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null} Registrar
            </Button>
            <Button type="button" size="xl" variant="outline" onClick={() => setKind(null)}>
              Voltar
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
