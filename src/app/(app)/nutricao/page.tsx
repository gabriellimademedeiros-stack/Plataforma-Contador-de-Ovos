import type { Metadata } from "next";
import { getScope } from "@/server/services/context";
import { getNutritionPage } from "@/server/services/thematic";
import { getRefDate } from "@/server/repositories/reference";
import { resolveFilters, type SearchParams } from "@/lib/filters";
import { TimeSeriesChart } from "@/components/charts";
import { PageHeader, Section } from "@/components/layout/page-header";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { STATUS_BG } from "@/components/kpi/status";
import { fmtDate, fmtNumber, fmtSignedPct } from "@/lib/format";

export const metadata: Metadata = { title: "Nutrição" };

export default async function NutricaoPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const scope = await getScope();
  const f = resolveFilters(await searchParams, await getRefDate());
  const d = await getNutritionPage(scope, f.days);
  return (
    <div className="space-y-4">
      <PageHeader title="Nutrição, água e peso" description={`${fmtDate(d.from)} a ${fmtDate(d.to)} · tabela com os últimos 7 dias`} />
      <Section title="Por galpão (últimos 7 dias)">
        <Table>
          <THead>
            <TR>
              <TH>Galpão</TH>
              <TH className="text-right">Ração (g/ave)</TH>
              <TH className="text-right">× padrão</TH>
              <TH className="text-right">Água (mL/ave)</TH>
              <TH className="text-right">× padrão</TH>
              <TH className="text-right">Água:ração</TH>
              <TH className="text-right">Conv. (kg/dz)</TH>
              <TH className="text-right">Peso corporal (g)</TH>
              <TH className="text-right">Curva (g)</TH>
              <TH className="text-right">Uniformidade</TH>
            </TR>
          </THead>
          <TBody>
            {d.table.map((r) => (
              <TR key={r.house}>
                <TD className="font-medium">{r.house}</TD>
                <TD className="text-right tabular-nums">{fmtNumber(r.feed, 1)}</TD>
                <TD className="p-0.5 text-right">
                  <span className={`block rounded px-2 py-1 tabular-nums ${STATUS_BG[r.feedStatus]}`}>{fmtSignedPct(r.feedDev)}</span>
                </TD>
                <TD className="text-right tabular-nums">{fmtNumber(r.water, 0)}</TD>
                <TD className="p-0.5 text-right">
                  <span className={`block rounded px-2 py-1 tabular-nums ${STATUS_BG[r.waterStatus]}`}>{fmtSignedPct(r.waterDev)}</span>
                </TD>
                <TD className="text-right tabular-nums">{fmtNumber(r.ratio, 2)}</TD>
                <TD className="text-right tabular-nums">{fmtNumber(r.conv, 3)}</TD>
                <TD className="text-right tabular-nums">{fmtNumber(r.bw, 0)}</TD>
                <TD className="text-right tabular-nums">{fmtNumber(r.bwStd, 0)}</TD>
                <TD className="text-right tabular-nums">{fmtNumber(r.uni, 1)}%</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Section>
      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Ração">
          <TimeSeriesChart spec={d.feed} />
        </Section>
        <Section title="Água">
          <TimeSeriesChart spec={d.water} />
        </Section>
        <Section title="Água:ração">
          <TimeSeriesChart spec={d.ratio} />
        </Section>
        <Section title="Conversão">
          <TimeSeriesChart spec={d.conv} />
        </Section>
      </div>
      <Section title="Cargas de ração" description="O gráfico agrupa os galpões que recebem as mesmas cargas: um problema de carga aparece só no grupo afetado.">
        <TimeSeriesChart spec={d.byBatch} height={300} />
        <Table>
          <THead>
            <TR>
              <TH>Carga</TH>
              <TH>Entrega</TH>
              <TH>Galpões</TH>
              <TH className="text-right">R$/kg</TH>
              <TH className="text-right">Cálcio esperado</TH>
            </TR>
          </THead>
          <TBody>
            {d.batches.map((b) => (
              <TR key={b.code}>
                <TD className="font-mono text-xs">{b.code}</TD>
                <TD>{fmtDate(b.deliveredOn)}</TD>
                <TD>{b.houses.join(", ")}</TD>
                <TD className="text-right tabular-nums">{fmtNumber(b.price, 2)}</TD>
                <TD className="text-right tabular-nums">{fmtNumber(b.calcium, 1)}%</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Section>
    </div>
  );
}
