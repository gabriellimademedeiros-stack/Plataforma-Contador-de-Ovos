import type { Metadata } from "next";
import { getScope } from "@/server/services/context";
import { getQualityPage } from "@/server/services/thematic";
import { getRefDate } from "@/server/repositories/reference";
import { resolveFilters, type SearchParams } from "@/lib/filters";
import { BarChart, Heatmap, Pareto, TimeSeriesChart } from "@/components/charts";
import { PageHeader, Section } from "@/components/layout/page-header";
import { ParamSelect } from "@/components/layout/defect-select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EstimatedBadge } from "@/components/kpi/status";
import { fmtBRL, fmtDate, fmtNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Qualidade do ovo" };

export default async function QualidadePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const scope = await getScope();
  const f = resolveFilters(sp, await getRefDate());
  const d = await getQualityPage(scope, f.days, typeof sp.defeito === "string" ? sp.defeito : "qual.trincados");
  return (
    <div className="space-y-4">
      <PageHeader title="Qualidade do ovo" description={`Classes do contador · ${fmtDate(d.from)} a ${fmtDate(d.to)}`} />
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">Contador simulado — nota de confiança fictícia.</div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Classes por galpão">
          <BarChart spec={d.perHouse} height={320} />
        </Section>
        <Section title="Tendência diária">
          <TimeSeriesChart spec={d.trend} height={320} />
        </Section>
      </div>
      <Section title="Mapa de calor por defeito" actions={<ParamSelect name="defeito" value={d.defect} options={d.classMetrics} label="Defeito" />}>
        <Heatmap spec={d.heat} />
      </Section>
      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Pareto de defeitos da granja">
          <Pareto spec={d.pareto} />
        </Section>
        <Section title="Avarias por pista" description="Razão ≥ 2,0 indica problema concentrado numa pista (esteira, coleta).">
          <Table>
            <THead>
              <TR>
                <TH>Galpão</TH>
                <TH className="text-right">Avarias P1 (%)</TH>
                <TH className="text-right">Avarias P2 (%)</TH>
                <TH className="text-right">Trincados P1 (%)</TH>
                <TH className="text-right">Trincados P2 (%)</TH>
                <TH className="text-right">Razão</TH>
              </TR>
            </THead>
            <TBody>
              {d.lanes.map((l) => (
                <TR key={l.house}>
                  <TD className="font-medium">{l.house}</TD>
                  <TD className="text-right tabular-nums">{fmtNumber(l.p1, 2)}</TD>
                  <TD className="text-right tabular-nums">{fmtNumber(l.p2, 2)}</TD>
                  <TD className="text-right tabular-nums">{fmtNumber(l.t1, 2)}</TD>
                  <TD className="text-right tabular-nums">{fmtNumber(l.t2, 2)}</TD>
                  <TD className={`text-right tabular-nums ${l.ratio && l.ratio >= 1.4 ? "font-semibold text-red-700" : ""}`}>{fmtNumber(l.ratio, 2)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Section>
      </div>
      {d.loss && (
        <Section title="Perda financeira por defeito" actions={<EstimatedBadge />} description="(Preço comercial − preço do destino) × quantidade ÷ 12, no período.">
          <Table>
            <TBody>
              {d.loss.map((l) => (
                <TR key={l.label}>
                  <TD>{l.label}</TD>
                  <TD className="text-right tabular-nums">{fmtBRL(l.value)}</TD>
                </TR>
              ))}
              <TR className="font-semibold">
                <TD>Total</TD>
                <TD className="text-right tabular-nums">{fmtBRL(d.loss.reduce((a, l) => a + l.value, 0))}</TD>
              </TR>
            </TBody>
          </Table>
        </Section>
      )}
    </div>
  );
}
