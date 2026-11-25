import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getScope } from "@/server/services/context";
import { getCulling, getFinanceOverview, getPriceSimInputs } from "@/server/services/finance";
import { getFlocks } from "@/server/repositories/reference";
import { PageHeader, Section, EmptyState } from "@/components/layout/page-header";
import { TabNav } from "@/components/house/tab-nav";
import { ParamSelect } from "@/components/layout/defect-select";
import { BarChart, RankingBars, TimeSeriesChart, Waterfall } from "@/components/charts";
import { PriceSimulator } from "@/components/finance/price-simulator";
import { CullingView } from "@/components/finance/culling-view";
import { EstimatedBadge, STATUS_BG } from "@/components/kpi/status";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { fmtBRL, fmtNumber, fmtPP } from "@/lib/format";
import { houseColor } from "@/lib/colors";
import type { SearchParams } from "@/lib/filters";

export const metadata: Metadata = { title: "Financeiro" };

export default async function FinanceiroPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const scope = await getScope();
  if (!scope.canSeeFinance) redirect("/");
  const sp = await searchParams;
  const tab = ["visao", "simulador", "descarte"].includes(String(sp.aba)) ? String(sp.aba) : "visao";
  return (
    <div className="space-y-4">
      <PageHeader title="Financeiro" description="Todos os valores são estimados a partir de parâmetros simulados." actions={<EstimatedBadge />} />
      <TabNav base="/financeiro" active={tab} tabs={[{ key: "visao", label: "Visão" }, { key: "simulador", label: "Simulador de preços" }, { key: "descarte", label: "Decisão de descarte" }]} />
      {tab === "visao" && <Overview />}
      {tab === "simulador" && <Simulator />}
      {tab === "descarte" && <Culling flock={typeof sp.lote === "string" ? sp.lote : "L107"} />}
    </div>
  );
}

async function Overview() {
  const scope = await getScope();
  const d = await getFinanceOverview(scope);
  const sorted = [...d.houses].sort((a, b) => b.sum.margem - a.sum.margem);
  const t = d.total;
  const color = (m: number | null) => (m == null ? "cinza" : m >= 0.2 ? "verde" : m >= 0 ? "amarelo" : "vermelho");
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <Section title={`Margem por galpão — ${d.weekLabel}`}>
          <RankingBars spec={{ kind: "hbar", unit: "R$", decimals: 0, categories: sorted.map((h) => h.house), series: [{ name: "Margem", type: "bar", data: sorted.map((h) => [h.house, h.sum.margem]), colors: sorted.map((h) => (h.sum.margem < 0 ? "#dc2626" : houseColor(h.house))) }] }} height={300} />
        </Section>
        <Section title="Da receita à margem (granja, semana)">
          <Waterfall
            spec={{
              kind: "waterfall",
              unit: "R$",
              decimals: 0,
              series: [{ name: "Granja", data: [["Receita", t.receita], ["Ração", -t.custoRacao], ["Embalagem", -t.custoEmbalagem], ["Overhead", -t.custoOverhead], ["Fixos", -t.custoFixo], ["Amortização da franga", -t.custoAve], ["Sanidade", -t.custoSanidade], ["Margem", t.margem]] }],
            }}
            height={300}
          />
        </Section>
      </div>
      <Section title="Evolução semanal da granja">
        <TimeSeriesChart spec={{ kind: "timeseries", unit: "R$", decimals: 0, series: [{ name: "Receita", color: "#16a34a", data: d.evolution.map((e) => [e.week, e.receita]) }, { name: "Custo", color: "#dc2626", data: d.evolution.map((e) => [e.week, e.custo]) }, { name: "Margem", color: "#1e3a5f", type: "bar", data: d.evolution.map((e) => [e.week, e.margem]) }] }} height={300} />
      </Section>
      <Section title={`Por galpão — ${d.weekLabel}`}>
        <Table>
          <THead>
            <TR>
              <TH>Galpão</TH>
              <TH>Lote</TH>
              <TH className="text-right">Receita</TH>
              <TH className="text-right">Custo</TH>
              <TH className="text-right">Margem</TH>
              <TH className="text-right">Custo/dz</TH>
              <TH className="text-right">Margem/dz</TH>
              <TH className="text-right">Margem/ave alojada</TH>
              <TH className="text-right">Postura real</TH>
              <TH className="text-right">Equilíbrio</TH>
              <TH className="text-right">Folga</TH>
            </TR>
          </THead>
          <TBody>
            {d.houses.map((h) => (
              <TR key={h.house}>
                <TD>
                  <Link href={`/galpoes/${h.house}?aba=financeiro`} className="font-medium text-primary hover:underline">
                    {h.house}
                  </Link>
                </TD>
                <TD>{h.flock}</TD>
                <TD className="text-right tabular-nums">{fmtBRL(h.sum.receita, 0)}</TD>
                <TD className="text-right tabular-nums">{fmtBRL(h.sum.custo, 0)}</TD>
                <TD className="text-right tabular-nums">{fmtBRL(h.sum.margem, 0)}</TD>
                <TD className="text-right tabular-nums">{fmtBRL(h.custoDz)}</TD>
                <TD className="p-0.5 text-right">
                  <span className={`block rounded px-2 py-1 tabular-nums ${STATUS_BG[color(h.margemDz)]}`}>{fmtBRL(h.margemDz)}</span>
                </TD>
                <TD className="text-right tabular-nums">{fmtBRL(h.marginPerBird, 3)}</TD>
                <TD className="text-right tabular-nums">{fmtNumber(h.posture, 1)}%</TD>
                <TD className="text-right tabular-nums">{fmtNumber(h.breakEven, 1)}%</TD>
                <TD className="text-right tabular-nums">{fmtPP(h.posture != null && h.breakEven != null ? h.posture - h.breakEven : null)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
        <p className="mt-2 text-xs text-muted-foreground">Postura de equilíbrio = custo ÷ (receita por ovo × aves-dia) × 100, calculada sobre os totais da semana.</p>
      </Section>
      <Section title="Composição dos custos por galpão (semana)">
        <BarChart spec={{ kind: "bar", unit: "R$", decimals: 0, categories: d.houses.map((h) => h.house), series: [["Ração", "custoRacao", "#a16207"], ["Embalagem", "custoEmbalagem", "#0891b2"], ["Overhead", "custoOverhead", "#64748b"], ["Fixos", "custoFixo", "#334155"], ["Amortização da franga", "custoAve", "#7c3aed"], ["Sanidade", "custoSanidade", "#dc2626"]].map(([n, k, c]) => ({ name: n, color: c, stack: "c", type: "bar" as const, data: d.houses.map((h) => [h.house, (h.sum as Record<string, number>)[k]] as [string, number]) })) }} height={320} />
      </Section>
    </div>
  );
}

async function Simulator() {
  const scope = await getScope();
  const d = await getPriceSimInputs(scope);
  return (
    <Section title="Simulador de preços">
      <PriceSimulator houses={d.houses} weekLabel={d.weekLabel} />
    </Section>
  );
}

async function Culling({ flock }: { flock: string }) {
  const scope = await getScope();
  const flocks = (await getFlocks()).filter((f) => f.status === "ativo" && scope.houseCodes.has(f.houseCode));
  const c = await getCulling(scope, flock);
  return (
    <Section title="Decisão de descarte" actions={<ParamSelect name="lote" label="Lote" value={flock} options={flocks.map((f) => ({ key: f.code, label: `${f.code} (${f.houseCode})` }))} />}>
      {c ? <CullingView c={c} /> : <EmptyState title="Lote não encontrado" />}
    </Section>
  );
}
