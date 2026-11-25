"use client";
/** Editores das configurações (metas, regras com prévia, custos, memória da empresa). */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

async function post(url: string, body: unknown, method = "POST"): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { ok: r.ok, data: await r.json().catch(() => ({})) };
}
const toNum = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
const fmt = (v: number | null | undefined) => (v == null ? "" : String(v).replace(".", ","));
const cell = "w-20 rounded border px-1.5 py-1 text-right text-sm tabular-nums disabled:bg-slate-50";

export function TargetRow({ t, canEdit }: { t: { id: string; label: string; unit: string; phase: string | null; greenMin: number | null; greenMax: number | null; yellowMin: number | null; yellowMax: number | null }; canEdit: boolean }) {
  const router = useRouter();
  const higher = t.greenMin != null;
  const [g, setG] = useState(fmt(higher ? t.greenMin : t.greenMax));
  const [y, setY] = useState(fmt(higher ? t.yellowMin : t.yellowMax));
  const [msg, setMsg] = useState<string | null>(null);
  const dirty = g !== fmt(higher ? t.greenMin : t.greenMax) || y !== fmt(higher ? t.yellowMin : t.yellowMax);
  return (
    <tr className="border-b">
      <td className="py-1.5">{t.label}</td>
      <td className="text-xs text-slate-500">{higher ? "maior é melhor" : "menor é melhor"}</td>
      <td className="text-xs">{t.phase ?? "todas"}</td>
      <td>
        <span className="mr-1 text-xs text-emerald-700">verde {higher ? "≥" : "≤"}</span>
        <input aria-label={`Verde ${t.label}`} className={cell} disabled={!canEdit} value={g} onChange={(e) => setG(e.target.value)} />
      </td>
      <td>
        <span className="mr-1 text-xs text-amber-700">amarelo {higher ? "≥" : "≤"}</span>
        <input aria-label={`Amarelo ${t.label}`} className={cell} disabled={!canEdit} value={y} onChange={(e) => setY(e.target.value)} />
      </td>
      <td className="text-xs text-slate-500">{t.unit}</td>
      <td className="text-right">
        {canEdit && dirty && (
          <Button
            size="sm"
            onClick={async () => {
              const r = await post("/api/configuracoes/metas", { id: t.id, greenMin: higher ? toNum(g) : null, greenMax: higher ? null : toNum(g), yellowMin: higher ? toNum(y) : null, yellowMax: higher ? null : toNum(y) });
              setMsg(r.ok ? "salvo" : String(r.data.error ?? "erro"));
              if (r.ok) router.refresh();
            }}
          >
            Salvar
          </Button>
        )}
        {msg && <span className={cn("ml-1 text-xs", msg === "salvo" ? "text-emerald-700" : "text-red-700")}>{msg}</span>}
      </td>
    </tr>
  );
}

const PARAM_PT: Record<string, string> = {
  factor: "fator × referência",
  min_pct: "mínimo (%)",
  critical_pct: "crítico (%)",
  median_days: "dias da mediana",
  persistence: "dias seguidos para abrir",
  normal_factor: "fator de normalização",
  normal_days: "dias normais para fechar",
  min_valid: "dias válidos mínimos",
  drop_pp: "queda (p.p.)",
  base_days: "dias de base",
  internal_pp: "abaixo do padrão interno (p.p.)",
  strain_pp: "abaixo da linhagem (p.p.)",
  min_age_weeks: "idade mínima (semanas)",
  hours_threshold: "temperatura de referência (°C)",
  min_hours: "horas mínimas",
  critical_temp: "temperatura crítica (°C)",
  min_add_pp: "aumento mínimo (p.p.)",
  ratio: "razão máxima",
  weeks: "semanas",
  temp: "temperatura (°C)",
  days_ahead: "dias à frente",
  lookback_min: "janela (minutos)",
  no_eggs_min: "minutos sem ovos",
  start_hour: "hora inicial",
  end_hour: "hora final",
  k: "folga k (CUSUM)",
  h: "limite h (CUSUM)",
  lane_ratio: "razão entre pistas",
  normal_pp: "volta ao normal (p.p.)",
  normal_ratio: "razão para normalizar",
  min_flocks: "lotes mínimos no padrão",
  min_sd: "desvio mínimo (resíduos)",
  resid_days: "dias de resíduos",
  min_eggs_lane: "ovos mínimos por pista",
};

export function RuleEditor({ r, canEdit }: { r: { code: string; name: string; description: string; severity: string; kind: string; params: Record<string, number>; defaults: Record<string, number>; active: boolean; version: number }; canEdit: boolean }) {
  const router = useRouter();
  const [vals, setVals] = useState<Record<string, string>>(Object.fromEntries(Object.entries(r.params).map(([k, v]) => [k, fmt(v)])));
  const [active, setActive] = useState(r.active);
  const [prev, setPrev] = useState<{ proposed: number | null; current: number | null; houses: Record<string, number>; message: string | null; applicable: boolean } | null>(null);
  const [busy, setBusy] = useState<"prev" | "save" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const params = Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, toNum(v) ?? 0]));
  return (
    <div className={cn("rounded-xl border bg-white p-3", !active && "opacity-70")}>
      <div className="flex flex-wrap items-start gap-2">
        <div className="flex-1">
          <div className="font-semibold">
            {r.code} — {r.name} <span className="ml-1 rounded bg-slate-100 px-1.5 text-[11px] font-normal">{r.kind.replace("_", " ")}</span> <span className="text-[11px] font-normal text-slate-500">versão {r.version}</span>
          </div>
          <div className="text-xs text-slate-600">{r.description}</div>
        </div>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" disabled={!canEdit} checked={active} onChange={(e) => setActive(e.target.checked)} /> ativa
        </label>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
        {Object.keys(r.params).map((k) => (
          <label key={k} className="text-xs">
            <span className="block text-slate-600">{PARAM_PT[k] ?? k}</span>
            <input className={cn(cell, "w-full text-left", vals[k] !== fmt(r.defaults[k]) && "border-amber-400")} disabled={!canEdit} value={vals[k]} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} />
            <span className="text-[10px] text-slate-400">padrão: {fmt(r.defaults[k])}</span>
          </label>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={!!busy}
          onClick={async () => {
            setBusy("prev");
            const res = await post("/api/configuracoes/regras/previa", { code: r.code, params });
            setBusy(null);
            if (res.ok) setPrev(res.data as never);
            else setMsg(String(res.data.error ?? "erro"));
          }}
        >
          {busy === "prev" && <Loader2 className="animate-spin" />} Prévia (90 dias)
        </Button>
        {canEdit && (
          <Button
            size="sm"
            disabled={!!busy}
            onClick={async () => {
              setBusy("save");
              const res = await post("/api/configuracoes/regras", { code: r.code, params, active });
              setBusy(null);
              setMsg(res.ok ? "salvo — vale a partir da próxima avaliação" : String(res.data.error ?? "erro"));
              if (res.ok) router.refresh();
            }}
          >
            {busy === "save" ? <Loader2 className="animate-spin" /> : <Check />} Salvar
          </Button>
        )}
        {prev && (
          <span className="text-sm">
            {prev.applicable ? (
              <>
                Teria disparado <b>{prev.proposed}</b> vez(es) nos últimos 90 dias com estes parâmetros (hoje: {prev.current}).
                {Object.keys(prev.houses).length > 0 && <span className="text-xs text-slate-500"> Por galpão: {Object.entries(prev.houses).sort().map(([h, n]) => `${h} ${n}`).join(", ")}.</span>}
              </>
            ) : (
              <span className="text-slate-600">{prev.message}</span>
            )}
          </span>
        )}
        {msg && <span className={cn("text-xs", msg.startsWith("salvo") ? "text-emerald-700" : "text-red-700")}>{msg}</span>}
      </div>
    </div>
  );
}

export function CostRow({ c, canEdit }: { c: { key: string; label: string; value: number; unit: string }; canEdit: boolean }) {
  const router = useRouter();
  const [v, setV] = useState(fmt(c.value));
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <tr className="border-b">
      <td className="py-1.5">{c.label}</td>
      <td>
        <input aria-label={c.label} className={cell} disabled={!canEdit} value={v} onChange={(e) => setV(e.target.value)} />
      </td>
      <td className="text-xs text-slate-500">{c.unit}</td>
      <td className="text-right">
        {canEdit && v !== fmt(c.value) && (
          <Button
            size="sm"
            onClick={async () => {
              const r = await post("/api/configuracoes/custos", { key: c.key, value: toNum(v) });
              setMsg(r.ok ? "salvo" : String(r.data.error ?? "erro"));
              if (r.ok) router.refresh();
            }}
          >
            Salvar
          </Button>
        )}
        {msg && <span className="ml-1 text-xs text-emerald-700">{msg}</span>}
      </td>
    </tr>
  );
}

export function MemoryEditor({ items, canEdit }: { items: Array<{ id: string; text: string; active: boolean; createdAt: string; author: string | null }>; canEdit: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      {canEdit && (
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await post("/api/configuracoes/memoria", { text });
            if (r.ok) {
              setText("");
              setErr(null);
              router.refresh();
            } else setErr(String(r.data.error ?? "erro"));
          }}
        >
          <input className="flex-1 rounded-md border px-2 py-1.5 text-sm" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ex.: O P005 tem as placas evaporativas mais antigas da granja." aria-label="Novo item da memória" />
          <Button size="sm" type="submit">
            <Plus /> Adicionar
          </Button>
        </form>
      )}
      {err && <p className="text-xs text-red-700">{err}</p>}
      <ul className="divide-y">
        {items.map((m) => (
          <li key={m.id} className={cn("flex items-center gap-3 py-2 text-sm", !m.active && "text-slate-400 line-through")}>
            <span className="flex-1">{m.text}</span>
            <span className="text-xs text-slate-500">{m.author ?? ""} · {new Date(m.createdAt).toLocaleDateString("pt-BR")}</span>
            {canEdit && (
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  await post(`/api/configuracoes/memoria/${m.id}`, { active: !m.active }, "PATCH");
                  router.refresh();
                }}
              >
                {m.active ? "Desativar" : "Reativar"}
              </Button>
            )}
          </li>
        ))}
        {items.length === 0 && <li className="py-2 text-sm text-slate-500">Nada registrado ainda.</li>}
      </ul>
    </div>
  );
}
