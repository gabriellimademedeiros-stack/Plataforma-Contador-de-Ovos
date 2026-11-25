"use client";
/** Montador de comparativos (Parte 14.16): tipo, itens, métrica, eixo e período → gráfico + tabela, favoritos e CSV. */
import { useEffect, useState } from "react";
import { Loader2, Play, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EChart } from "@/components/charts/echart";
import type { ChartSpec } from "@/components/charts/types";
import { CsvButton } from "@/components/production/csv-button";
import { addDays } from "@/lib/dates";
import { cn } from "@/lib/utils";

type Tipo = "galpoes" | "lotes" | "linhagens" | "periodos" | "evento";
interface Params {
  tipo: Tipo;
  itens: string[];
  metrica: string;
  eixo: "data" | "idade" | "dias_evento";
  inicio: string | null;
  fim: string | null;
  galpao: string | null;
  evento: string | null;
}
interface Result {
  titulo: string;
  spec: ChartSpec;
  tabela: Array<{ item: string; n: number; media: number | null; dp: number | null; diferenca: number | null; detalhe?: string }>;
  avisos: string[];
  unidade: string;
  decimais: number;
}
interface Saved {
  id: string;
  name: string;
  params: Params;
}

const TIPOS: Array<{ v: Tipo; label: string }> = [
  { v: "galpoes", label: "Galpões" },
  { v: "lotes", label: "Lotes (mesma idade)" },
  { v: "linhagens", label: "Linhagens" },
  { v: "periodos", label: "Períodos" },
  { v: "evento", label: "Antes × depois de um evento" },
];
const nf = (v: number | null, d: number) => (v == null ? "—" : new Intl.NumberFormat("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v));

function Chip({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn("rounded-full border px-2.5 py-1 text-xs", on ? "border-emerald-600 bg-emerald-600 text-white" : "bg-white hover:border-emerald-400")}>
      {children}
    </button>
  );
}

export function ComparisonBuilder(p: { houses: string[]; flocks: Array<{ code: string; house: string; strain: string; status: string; start: string; end: string | null }>; strains: string[]; metrics: Array<{ code: string; name: string; group: string }>; events: Array<{ id: string; label: string }>; refDate: string }) {
  const [params, setParams] = useState<Params>({ tipo: "lotes", itens: [], metrica: "prod.postura", eixo: "idade", inicio: addDays(p.refDate, -89), fim: p.refDate, galpao: null, evento: p.events[0]?.id ?? null });
  const [periods, setPeriods] = useState<Array<{ a: string; b: string }>>([
    { a: addDays(p.refDate, -27), b: p.refDate },
    { a: addDays(p.refDate, -55), b: addDays(p.refDate, -28) },
  ]);
  const [res, setRes] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [favName, setFavName] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/comparativos/salvos")
      .then((r) => (r.ok ? r.json() : { saved: [] }))
      .then((d) => alive && setSaved(d.saved ?? []));
    return () => {
      alive = false;
    };
  }, []);

  const set = (patch: Partial<Params>) => setParams((x) => ({ ...x, ...patch }));
  const toggle = (v: string) => set({ itens: params.itens.includes(v) ? params.itens.filter((x) => x !== v) : [...params.itens, v] });

  async function run(pp: Params = params) {
    setBusy(true);
    setError(null);
    const body = { ...pp, itens: pp.tipo === "periodos" ? periods.map((x) => `${x.a}/${x.b}`) : pp.itens, eixo: pp.tipo === "lotes" || pp.tipo === "linhagens" ? "idade" : pp.tipo === "evento" ? "dias_evento" : pp.eixo };
    const r = await fetch("/api/comparativos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) {
      setRes(null);
      setError(d.error ?? "Não foi possível comparar.");
    } else setRes(d);
  }

  async function saveFav() {
    const body = { name: favName || res?.titulo || "Comparativo", params: { ...params, itens: params.tipo === "periodos" ? periods.map((x) => `${x.a}/${x.b}`) : params.itens } };
    const r = await fetch("/api/comparativos/salvos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (r.ok) {
      const d = await r.json();
      setSaved((s) => [d.saved, ...s]);
      setFavName("");
    }
  }

  function load(s: Saved) {
    const pp = { ...params, ...s.params };
    if (pp.tipo === "periodos") setPeriods(pp.itens.map((x) => ({ a: x.split("/")[0], b: x.split("/")[1] })));
    setParams(pp);
    run(pp);
  }

  const groups = Array.from(new Set(p.metrics.map((m) => m.group)));
  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <div className="space-y-4">
        <div className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
          <div>
            <div className="mb-1 text-xs font-semibold text-slate-600">Tipo</div>
            <div className="flex flex-wrap gap-1.5">
              {TIPOS.map((t) => (
                <Chip key={t.v} on={params.tipo === t.v} onClick={() => set({ tipo: t.v, itens: [] })}>
                  {t.label}
                </Chip>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Métrica</span>
            <select value={params.metrica} onChange={(e) => set({ metrica: e.target.value })} className="w-full rounded-md border px-2 py-1.5 text-sm">
              {groups.map((g) => (
                <optgroup key={g} label={g}>
                  {p.metrics.filter((m) => m.group === g).map((m) => (
                    <option key={m.code} value={m.code}>
                      {m.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          {params.tipo === "galpoes" && (
            <div>
              <div className="mb-1 text-xs font-semibold text-slate-600">Galpões (2 a 8)</div>
              <div className="flex flex-wrap gap-1.5">
                {p.houses.map((h) => (
                  <Chip key={h} on={params.itens.includes(h)} onClick={() => toggle(h)}>
                    {h}
                  </Chip>
                ))}
              </div>
            </div>
          )}
          {params.tipo === "lotes" && (
            <div>
              <div className="mb-1 text-xs font-semibold text-slate-600">Lotes (ativos e encerrados)</div>
              <div className="flex max-h-56 flex-wrap gap-1.5 overflow-y-auto">
                {[...p.flocks].sort((a, b) => (a.code < b.code ? -1 : 1)).map((f) => (
                  <Chip key={f.code} on={params.itens.includes(f.code)} onClick={() => toggle(f.code)}>
                    {f.code} · {f.house} · {f.strain}
                    {f.status === "ativo" ? " · ativo" : ""}
                  </Chip>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-slate-500">Comparação sempre por semana de idade; a tabela usa as semanas em comum.</p>
            </div>
          )}
          {params.tipo === "linhagens" && (
            <div>
              <div className="mb-1 text-xs font-semibold text-slate-600">Linhagens (vazio = todas)</div>
              <div className="flex flex-wrap gap-1.5">
                {p.strains.map((s) => (
                  <Chip key={s} on={params.itens.includes(s)} onClick={() => toggle(s)}>
                    {s}
                  </Chip>
                ))}
              </div>
            </div>
          )}
          {params.tipo === "periodos" && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-600">Períodos (2 a 4)</div>
              {periods.map((x, i) => (
                <div key={i} className="flex items-center gap-1 text-sm">
                  <input type="date" value={x.a} max={p.refDate} onChange={(e) => setPeriods(periods.map((y, k) => (k === i ? { ...y, a: e.target.value } : y)))} className="rounded border px-1 py-0.5" />
                  <span>a</span>
                  <input type="date" value={x.b} max={p.refDate} onChange={(e) => setPeriods(periods.map((y, k) => (k === i ? { ...y, b: e.target.value } : y)))} className="rounded border px-1 py-0.5" />
                  {periods.length > 2 && (
                    <button type="button" aria-label="Remover período" onClick={() => setPeriods(periods.filter((_, k) => k !== i))} className="text-slate-400 hover:text-red-600">
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              ))}
              {periods.length < 4 && (
                <button type="button" className="text-xs text-emerald-700 underline" onClick={() => setPeriods([...periods, { a: addDays(p.refDate, -6), b: p.refDate }])}>
                  + adicionar período
                </button>
              )}
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600">Galpão</span>
                <select value={params.galpao ?? ""} onChange={(e) => set({ galpao: e.target.value || null })} className="w-full rounded-md border px-2 py-1.5 text-sm">
                  <option value="">Granja (galpões que você vê)</option>
                  {p.houses.map((h) => (
                    <option key={h}>{h}</option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {params.tipo === "evento" && (
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">Evento (14 dias antes × até 21 dias depois)</span>
              <select value={params.evento ?? ""} onChange={(e) => set({ evento: e.target.value })} className="w-full rounded-md border px-2 py-1.5 text-sm">
                {p.events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {params.tipo === "galpoes" && (
            <>
              <div>
                <div className="mb-1 text-xs font-semibold text-slate-600">Eixo</div>
                <div className="flex gap-1.5">
                  <Chip on={params.eixo === "data"} onClick={() => set({ eixo: "data" })}>
                    Data
                  </Chip>
                  <Chip on={params.eixo === "idade"} onClick={() => set({ eixo: "idade" })}>
                    Idade
                  </Chip>
                </div>
              </div>
              <div className="flex items-center gap-1 text-sm">
                <input type="date" aria-label="Início" value={params.inicio ?? ""} max={p.refDate} onChange={(e) => set({ inicio: e.target.value })} className="rounded border px-1 py-0.5" />
                <span>a</span>
                <input type="date" aria-label="Fim" value={params.fim ?? ""} max={p.refDate} onChange={(e) => set({ fim: e.target.value })} className="rounded border px-1 py-0.5" />
              </div>
            </>
          )}
          <Button onClick={() => run()} disabled={busy} className="w-full">
            {busy ? <Loader2 className="animate-spin" /> : <Play />} Comparar
          </Button>
          {error && <p className="text-sm text-red-700">{error}</p>}
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-1 text-sm font-semibold">
            <Star className="size-4 text-amber-500" /> Relatórios favoritos
          </div>
          {saved.length === 0 && <p className="text-xs text-slate-500">Nenhum favorito salvo.</p>}
          <ul className="space-y-1">
            {saved.map((s) => (
              <li key={s.id} className="flex items-center gap-2 text-sm">
                <button type="button" className="flex-1 truncate text-left text-emerald-800 hover:underline" onClick={() => load(s)}>
                  {s.name}
                </button>
                <button
                  type="button"
                  aria-label="Excluir favorito"
                  className="text-slate-400 hover:text-red-600"
                  onClick={async () => {
                    const r = await fetch(`/api/comparativos/salvos/${s.id}`, { method: "DELETE" });
                    if (r.ok) setSaved((x) => x.filter((y) => y.id !== s.id));
                  }}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="min-w-0 space-y-3">
        {!res && !busy && <div className="rounded-xl border border-dashed bg-white p-10 text-center text-sm text-slate-500">Escolha o tipo, os itens e a métrica e clique em “Comparar”. Ex.: dois lotes do mesmo galpão na mesma semana de idade.</div>}
        {res && (
          <>
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="mb-2 font-semibold">{res.titulo}</div>
              <EChart spec={res.spec} height={360} />
            </div>
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <div className="flex-1 font-semibold">Tabela</div>
                <CsvButton name="comparativo" rows={[["Item", "n", `Média (${res.unidade})`, "Desvio-padrão", "Diferença × 1º item", "Detalhe"], ...res.tabela.map((t) => [t.item, t.n, t.media, t.dp, t.diferenca, t.detalhe ?? ""])]} />
                <input value={favName} onChange={(e) => setFavName(e.target.value)} placeholder="Nome do favorito" aria-label="Nome do favorito" className="h-8 rounded-md border px-2 text-sm" />
                <Button size="sm" variant="outline" onClick={saveFav}>
                  <Star /> Salvar como relatório favorito
                </Button>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-slate-500">
                    <th className="py-1">Item</th>
                    <th className="text-right">n</th>
                    <th className="text-right">Média ({res.unidade})</th>
                    <th className="text-right">Desvio-padrão</th>
                    <th className="text-right">Diferença × 1º item</th>
                    <th className="pl-3">Detalhe</th>
                  </tr>
                </thead>
                <tbody>
                  {res.tabela.map((t) => (
                    <tr key={t.item} className="border-b">
                      <td className="py-1.5 font-medium">{t.item}</td>
                      <td className="text-right tabular-nums">{t.n}</td>
                      <td className="text-right tabular-nums">{nf(t.media, res.decimais)}</td>
                      <td className="text-right tabular-nums">{nf(t.dp, res.decimais)}</td>
                      <td className="text-right tabular-nums">{t.diferenca == null ? "—" : `${t.diferenca > 0 ? "+" : t.diferenca < 0 ? "−" : ""}${nf(Math.abs(t.diferenca), res.decimais)}`}</td>
                      <td className="pl-3 text-xs text-slate-500">{t.detalhe ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {res.avisos.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-xs text-amber-800">
                  {res.avisos.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
