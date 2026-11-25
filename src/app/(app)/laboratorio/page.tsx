import Link from "next/link";
import { AlertTriangle, CalendarClock } from "lucide-react";
import { PageHeader, Section } from "@/components/layout/page-header";
import { TabNav } from "@/components/house/tab-nav";
import { ParamSelect } from "@/components/layout/defect-select";
import { TimeSeriesChart } from "@/components/charts";
import { EChart } from "@/components/charts/echart";
import { CsvButton } from "@/components/production/csv-button";
import { HaughLimitForm, NewShellSample, NewShelfTest, ShelfMeasurementForm } from "@/components/lab/forms";
import { getScope } from "@/server/services/context";
import { getShellPage, getShelfLifePage, LAB_MEASURES } from "@/server/services/lab";
import { farmToday } from "@/lib/dates";
import { fmtDate, fmtNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Laboratório" };

type SP = Promise<Record<string, string | undefined>>;

export default async function LaboratorioPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const aba = sp.aba === "shelf" ? "shelf" : "casca";
  const scope = await getScope();
  const today = farmToday();
  return (
    <div className="space-y-4">
      <PageHeader title="Laboratório" description="Qualidade da casca (resistência, espessura, gravidade, Haugh, peso, cor da gema) e testes de vida útil (shelf life)." />
      <TabNav base="/laboratorio" active={aba} tabs={[{ key: "casca", label: "Casca" }, { key: "shelf", label: "Shelf life" }]} />
      {aba === "casca" ? <Shell sp={sp} houses={[...scope.houseCodes].sort()} today={today} /> : <Shelf sp={sp} houses={[...scope.houseCodes].sort()} today={today} canConfigure={scope.canConfigure} />}
    </div>
  );
}

async function Shell({ sp, houses, today }: { sp: Record<string, string | undefined>; houses: string[]; today: string }) {
  const scope = await getScope();
  const d = await getShellPage(scope, { house: sp.galpao ?? null, from: sp.de ?? null, to: sp.ate ?? null });
  const rows = d.list.slice(0, 80);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <ParamSelect name="galpao" label="Galpão" value={d.house} options={houses.map((h) => ({ key: h, label: h }))} />
        <span className="text-sm text-slate-600">
          Lote atual: <b>{d.cur?.code ?? "—"}</b> ({d.cur?.strain ?? "—"})
        </span>
        <div className="flex-1" />
        <NewShellSample houses={houses} today={today} defaultHouse={d.house} />
      </div>
      <Section title="Medidas por idade contra o histórico da linhagem" description="Linha colorida = lote atual; tracejado = mediana dos outros lotes da mesma linhagem na mesma semana de idade; cinza = lotes anteriores.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {d.byAge.map((s) => (
            <div key={s.title} className="rounded border p-1">
              <EChart spec={s} height={230} />
            </div>
          ))}
        </div>
      </Section>
      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Resistência × trincados" description={d.regression ? `Cada ponto é uma amostra (últimas 52 semanas) contra os trincados do contador na mesma semana. Inclinação: ${fmtNumber(d.regression.b, 2)} p.p. de trincados por kgf (R² ${fmtNumber(d.regression.r2, 2)}).` : "Amostras insuficientes."}>
          <EChart spec={d.scatter} height={300} />
        </Section>
        <Section
          title="Gráfico de controle da resistência"
          description={d.limits ? `Média ${fmtNumber(d.limits.center, 2)} kgf; limites ${fmtNumber(d.limits.lcl, 2)} a ${fmtNumber(d.limits.ucl, 2)} kgf (± 3σ pela amplitude móvel, últimas ${d.limits.n} amostras do lote atual). ${d.outCount ? `${d.outCount} amostra(s) fora dos limites.` : "Nenhuma amostra fora dos limites."}` : "São necessárias pelo menos 5 amostras do lote atual."}
        >
          <TimeSeriesChart spec={d.control} height={280} />
        </Section>
      </div>
      <Section
        title={`Amostras de casca (${d.list.length})`}
        description="Filtre por galpão no seletor acima; período padrão: últimos 6 meses."
        actions={<CsvButton name={`amostras-casca-${d.house}`} rows={[["Data", "Galpão", "Lote", "Idade (sem.)", "Ovos", ...LAB_MEASURES.map((m) => `${m.label}${m.unit ? ` (${m.unit})` : ""}`), "Observação"], ...d.list.map((s) => [s.date, s.house, s.flock, s.ageWeek, s.n, ...LAB_MEASURES.map((m) => s[m.key]), s.notes ?? ""])]} />}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-slate-500">
                <th className="py-1">Data</th>
                <th>Galpão</th>
                <th>Lote</th>
                <th className="text-right">Idade</th>
                <th className="text-right">n</th>
                {LAB_MEASURES.map((m) => (
                  <th key={m.key} className="text-right">
                    {m.label.replace(" da casca", "")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-b">
                  <td className="py-1">{fmtDate(s.date)}</td>
                  <td>
                    <Link className="text-emerald-800 hover:underline" href={`/galpoes/${s.house}?aba=qualidade`}>
                      {s.house}
                    </Link>
                  </td>
                  <td>{s.flock}</td>
                  <td className="text-right tabular-nums">{s.ageWeek}</td>
                  <td className="text-right tabular-nums">{s.n ?? "—"}</td>
                  {LAB_MEASURES.map((m) => (
                    <td key={m.key} className={cn("text-right tabular-nums", m.key === "strength_kgf" && d.limits && s.flock === d.cur?.code && s[m.key] != null && (s[m.key]! < d.limits.lcl || s[m.key]! > d.limits.ucl) && "font-semibold text-red-700")}>
                      {fmtNumber(s[m.key], m.d)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {d.list.length > rows.length && <p className="mt-1 text-xs text-slate-500">Mostrando as {rows.length} mais recentes; o CSV traz todas.</p>}
        </div>
      </Section>
    </div>
  );
}

async function Shelf({ sp, houses, today, canConfigure }: { sp: Record<string, string | undefined>; houses: string[]; today: string; canConfigure: boolean }) {
  const scope = await getScope();
  const d = await getShelfLifePage(scope, sp.teste ?? null);
  const sel = d.sel;
  const fmtDays = (e: { days: number | null; method: string | null }) => (e.days == null ? (e.method === "acima do limite" ? "acima do limite" : "—") : `${fmtNumber(e.days, 1)} dias${e.method === "extrapolado" ? " (extrapolado)" : ""}`);
  return (
    <div className="space-y-4">
      <div className={cn("flex flex-wrap items-start gap-3 rounded-xl border p-3 text-sm", d.dueToday.length || d.overdue.length ? "border-amber-300 bg-amber-50" : "bg-white")}>
        <CalendarClock className="mt-0.5 size-4 text-amber-700" />
        <div className="flex-1">
          <div className="font-semibold">Medições de hoje ({fmtDate(d.today)})</div>
          {d.dueToday.length ? (
            <ul className="list-disc pl-5">
              {d.dueToday.map((x) => (
                <li key={`${x.test.id}-${x.day}`}>
                  {x.test.house} — teste de {fmtDate(x.test.start)}: medir o <b>dia {x.day}</b>
                </li>
              ))}
            </ul>
          ) : (
            <p>Nenhuma medição prevista para hoje.</p>
          )}
          {d.overdue.length > 0 && (
            <p className="mt-1 flex items-center gap-1 text-amber-800">
              <AlertTriangle className="size-3.5" /> Atrasadas: {d.overdue.map((x) => `${x.test.house} dia ${x.day} (${fmtDate(x.date)})`).join("; ")}
            </p>
          )}
          {d.upcoming.length > 0 && <p className="mt-1 text-slate-600">Próximos 3 dias: {d.upcoming.map((x) => `${x.test.house} dia ${x.day} em ${fmtDate(x.date)}`).join("; ")}</p>}
        </div>
        {canConfigure ? <HaughLimitForm value={d.limit} /> : <span>Limite de vida útil: {d.limit} UH</span>}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <Section
          title={sel ? `Teste do ${sel.house} iniciado em ${fmtDate(sel.start)}` : "Shelf life"}
          description={
            sel
              ? `Vida útil estimada (dias até ${d.limit} UH): ${fmtDays(sel.estimate)}. Média dos testes da linhagem ${sel.strain}: ${d.strainAvg?.days != null ? `${fmtNumber(d.strainAvg.days, 1)} dias (${d.strainAvg.n} testes)` : "—"}.${sel.estimate.days != null && d.strainAvg?.days != null ? ` ${sel.estimate.days < d.strainAvg.days ? `Queda mais rápida que a média: ${fmtNumber(d.strainAvg.days - sel.estimate.days, 1)} dia(s) a menos.` : "Dentro ou acima da média da linhagem."}` : ""}`
              : "Nenhum teste."
          }
        >
          {d.chart && <EChart spec={d.chart} height={320} />}
          {sel && (
            <div className="mt-3 space-y-3">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-slate-500">
                    <th className="py-1">Dia</th>
                    <th className="text-right">Ovos</th>
                    <th className="text-right">Haugh média</th>
                    <th className="text-right">Perda de peso</th>
                    <th className="text-right">Câmara de ar</th>
                  </tr>
                </thead>
                <tbody>
                  {sel.measurements.map((m) => (
                    <tr key={m.day} className="border-b">
                      <td className="py-1">dia {m.day}</td>
                      <td className="text-right tabular-nums">{m.n ?? "—"}</td>
                      <td className={cn("text-right tabular-nums", m.haugh != null && m.haugh <= d.limit && "font-semibold text-red-700")}>{fmtNumber(m.haugh, 1)}</td>
                      <td className="text-right tabular-nums">{m.weightLoss == null ? "—" : `${fmtNumber(m.weightLoss, 1)}%`}</td>
                      <td className="text-right tabular-nums">{m.airCell == null ? "—" : `${fmtNumber(m.airCell, 1)} mm`}</td>
                    </tr>
                  ))}
                  {sel.pending.map((p) => (
                    <tr key={`p${p.day}`} className="border-b text-slate-400">
                      <td className="py-1">dia {p.day}</td>
                      <td colSpan={4} className="text-right text-xs">
                        pendente — previsto para {fmtDate(p.date)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ShelfMeasurementForm testId={sel.id} days={sel.pending.filter((p) => p.date <= today).map((p) => p.day)} />
            </div>
          )}
        </Section>
        <Section title={`Testes (${d.items.length})`} description="Condição de armazenamento: temperatura (umidade no detalhe). ≈ = vida útil extrapolada (ainda acima do limite na última medição)." actions={<NewShelfTest houses={houses} today={today} />}>
          <div className="max-h-[560px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-slate-500">
                  <th className="py-1">Galpão</th>
                  <th>Início</th>
                  <th>Condição</th>
                  <th>Situação</th>
                  <th className="text-right">Vida útil</th>
                </tr>
              </thead>
              <tbody>
                {d.items.map((t) => (
                  <tr key={t.id} className={cn("border-b", sel?.id === t.id && "bg-emerald-50")}>
                    <td className="py-1">
                      <Link className="font-medium text-emerald-800 hover:underline" href={`/laboratorio?aba=shelf&teste=${t.id}`} scroll={false}>
                        {t.house}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap">{fmtDate(t.start)}</td>
                    <td className="text-xs whitespace-nowrap">{t.condition.split(" · ")[0]}</td>
                    <td className="text-xs whitespace-nowrap">{t.status}</td>
                    <td className="text-right text-xs whitespace-nowrap tabular-nums" title={t.estimate.method ?? ""}>{t.estimate.days == null ? "—" : `${t.estimate.method === "extrapolado" ? "≈ " : ""}${fmtNumber(t.estimate.days, 1)} dias`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </div>
  );
}
