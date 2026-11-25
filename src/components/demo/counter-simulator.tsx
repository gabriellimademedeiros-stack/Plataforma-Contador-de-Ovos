"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Copy, Play, PowerOff, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { counterStatus, resend, sendTick, type SentMessage } from "@/app/(app)/demo/contador-ao-vivo/actions";
import { cn } from "@/lib/utils";

const CLASSES: Array<[string, string]> = [
  ["clean", "Limpos"],
  ["cracked", "Trincados"],
  ["broken", "Quebrados"],
  ["dirty_feces", "Sujos de fezes"],
  ["dirty_blood", "Sujos de sangue"],
  ["undetermined", "Indeterminados"],
];
type Status = Awaited<ReturnType<typeof counterStatus>>;
const hm = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Fortaleza", hour: "2-digit", minute: "2-digit" });

export function CounterSimulator({ houses }: { houses: string[] }) {
  const [sel, setSel] = useState<string[]>(houses.slice(0, 2));
  const [down, setDown] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [sent, setSent] = useState<SentMessage[]>([]);
  const [last, setLast] = useState<SentMessage | null>(null);
  const [dupResult, setDupResult] = useState<SentMessage | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  // início: 10 minutos atrás (definido ao iniciar o envio); avança 1 minuto por envio até alcançar a hora atual
  const cursor = useRef<string | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      counterStatus(houses)
        .then((s) => alive && setStatus(s))
        .catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [houses]);

  useEffect(() => {
    if (!running) return;
    const tick = async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        const active = sel.filter((h) => !down.includes(h));
        if (active.length) {
          if (!cursor.current) cursor.current = new Date(Math.floor(Date.now() / 60_000) * 60_000 - 10 * 60_000).toISOString();
          const r = await sendTick(active, cursor.current);
          cursor.current = r.next;
          if (r.sent.length) {
            setSent((x) => [...r.sent, ...x].slice(0, 40));
            setLast(r.sent[r.sent.length - 1]);
          }
        }
      } finally {
        busy.current = false;
      }
    };
    tick();
    const t = setInterval(tick, 3000);
    return () => clearInterval(t);
  }, [running, sel, down]);

  const lat = sent.filter((s) => !s.duplicate && s.status === 200).slice(0, 20);
  const avg = lat.length ? Math.round(lat.reduce((a, s) => a + s.latencyMs, 0) / lat.length) : null;
  return (
    <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <div className="space-y-3">
        <div className="rounded-xl border bg-white p-3">
          <div className="mb-2 text-sm font-semibold">Galpões</div>
          <div className="flex flex-wrap gap-1.5">
            {houses.map((h) => (
              <button key={h} type="button" onClick={() => setSel((x) => (x.includes(h) ? x.filter((y) => y !== h) : [...x, h]))} className={cn("rounded-full border px-3 py-1 text-sm", sel.includes(h) ? "border-emerald-600 bg-emerald-600 text-white" : "bg-white")}>
                {h}
                {down.includes(h) ? " (derrubado)" : ""}
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {!running ? (
              <Button onClick={() => setRunning(true)} disabled={!sel.length}>
                <Play /> Iniciar
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setRunning(false)}>
                <Square /> Parar
              </Button>
            )}
            <Button variant="outline" disabled={!last} onClick={async () => last && setDupResult(await resend(last.body))}>
              <Copy /> Enviar mensagem duplicada
            </Button>
          </div>
          <div className="mt-3 border-t pt-3">
            <div className="mb-1 text-xs font-semibold text-slate-600">Derrubar contador (para de enviar; fica offline após 2 minutos)</div>
            <div className="flex flex-wrap gap-1.5">
              {sel.map((h) => (
                <Button key={h} size="sm" variant={down.includes(h) ? "destructive" : "outline"} onClick={() => setDown((x) => (x.includes(h) ? x.filter((y) => y !== h) : [...x, h]))}>
                  <PowerOff /> {down.includes(h) ? `Religar ${h}` : `Derrubar ${h}`}
                </Button>
              ))}
            </div>
          </div>
          {dupResult && (
            <div className={cn("mt-3 rounded border-l-4 p-2 text-sm", dupResult.duplicate ? "border-amber-500 bg-amber-50" : "border-red-500 bg-red-50")}>
              {dupResult.duplicate ? `Mensagem ${String(dupResult.body.message_id)} reenviada: ignorada pela plataforma (mesmo message_id, resposta 200 com "duplicate": true).` : `Resposta inesperada (${dupResult.status}).`}
            </div>
          )}
        </div>
        <div className="rounded-xl border bg-white p-3 text-sm">
          <div className="mb-2 font-semibold">Contadores</div>
          {status?.devices.map((d) => (
            <div key={d.code} className="flex items-center justify-between border-b py-1">
              <span>
                {d.code} · {d.house}
              </span>
              <span className="text-right text-xs">
                <span className={cn("rounded px-1.5 py-0.5 font-medium", d.online ? "bg-emerald-100 text-emerald-800" : d.lastSeen ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-600")}>{d.online ? "online" : d.lastSeen ? "offline" : "simulado"}</span>
                <span className="ml-2 text-slate-500">completude 10 min: {Math.round(d.completeness10 * 100)}%</span>
              </span>
            </div>
          ))}
          <Link href="/dispositivos" className="mt-2 inline-block text-xs text-emerald-700 underline">
            Ver a tela de dispositivos
          </Link>
        </div>
        <div className="rounded-xl border bg-white p-3 text-sm">
          <div className="mb-2 font-semibold">Totais do dia (contagem ao vivo)</div>
          <table className="w-full">
            <tbody>
              {CLASSES.map(([k, l]) => (
                <tr key={k} className="border-b">
                  <td className="py-0.5">{l}</td>
                  <td className="text-right tabular-nums">{(status?.totals as Record<string, number> | undefined)?.[k]?.toLocaleString("pt-BR") ?? "0"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate-500">Tempo entre envio e gravação: {avg != null ? `${avg} ms em média (últimas ${lat.length} mensagens)` : "—"}</p>
        </div>
      </div>
      <div className="rounded-xl border bg-white p-3">
        <div className="mb-2 text-sm font-semibold">Últimas 20 mensagens recebidas</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-slate-500">
              <th className="py-1">Mensagem</th>
              <th>Galpão</th>
              <th>Pista</th>
              <th>Janela</th>
              <th className="text-right">Ovos</th>
              <th className="text-right">Qualidade</th>
            </tr>
          </thead>
          <tbody>
            {(status?.last ?? []).map((m) => (
              <tr key={m.id} className="border-b">
                <td className="py-1 font-mono text-xs">{m.id}</td>
                <td>{m.house}</td>
                <td>{m.lane}</td>
                <td>{hm(m.ws)}</td>
                <td className="text-right tabular-nums">{m.eggs.toLocaleString("pt-BR")}</td>
                <td className="text-right text-xs">{m.qf ? "baixa confiança" : "ok"}</td>
              </tr>
            ))}
            {!status?.last.length && (
              <tr>
                <td colSpan={6} className="py-3 text-center text-xs text-slate-500">
                  Nenhuma mensagem ainda. Escolha os galpões e clique em Iniciar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="mt-3 text-xs text-slate-500">Envios desta sessão: {sent.length} · com erro: {sent.filter((s) => s.status !== 200).length}{sent.find((s) => s.error) ? ` (${sent.find((s) => s.error)!.error})` : ""}</div>
      </div>
    </div>
  );
}
