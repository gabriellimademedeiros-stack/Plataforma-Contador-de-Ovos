import type { Metadata } from "next";
import Link from "next/link";
import { getScope } from "@/server/services/context";
import { getProductionPage } from "@/server/services/thematic";
import { getRefDate } from "@/server/repositories/reference";
import { resolveFilters, type SearchParams } from "@/lib/filters";
import { AgeCurveChart, TimeSeriesChart } from "@/components/charts";
import { PageHeader, Section } from "@/components/layout/page-header";
import { FarmForecast } from "@/components/production/farm-forecast";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { fmtDate, fmtInt, fmtNumber, fmtPP } from "@/lib/format";
import { houseColor } from "@/lib/colors";

export const metadata: Metadata = { title: "Produção" };

const COLS: Array<[string, string, (v: number | null) => string]> = [
  ["prod.ovos", "Ovos", fmtInt],
  ["prod.caixas", "Caixas", (v) => fmtInt(v == null ? null : Math.round(v))],
  ["prod.postura", "Postura (%)", (v) => fmtNumber(v, 1)],
  ["prod.desvio_interno", "Desvio × interno", (v) => fmtPP(v)],
  ["prod.oaa", "Ovo/ave alojada", (v) => fmtNumber(v, 1)],
  ["prod.massa", "Massa (g/ave)", (v) => fmtNumber(v, 1)],
  ["prod.peso_ovo", "Peso (g)", (v) => fmtNumber(v, 1)],
];

export default async function ProducaoPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const scope = await getScope();
  const f = resolveFilters(await searchParams, await getRefDate());
  const d = await getProductionPage(scope, f.days);
  const table = (key: "day" | "week", label: string) => (
    <Section title={label}>
      <Table>
        <THead>
          <TR>
            <TH>Galpão</TH>
            {COLS.map((c) => (
              <TH key={c[0]} className="text-right">
                {c[1]}
              </TH>
            ))}
          </TR>
        </THead>
        <TBody>
          {d.table.map((r) => (
            <TR key={r.house}>
              <TD>
                <Link href={`/galpoes/${r.house}?aba=producao`} className="flex items-center gap-2 font-medium hover:underline">
                  <span className="size-2 rounded-full" style={{ background: houseColor(r.house) }} />
                  {r.house}
                </Link>
              </TD>
              {COLS.map((c) => (
                <TD key={c[0]} className="text-right tabular-nums">
                  {c[2](r[key][c[0]] as number | null)}
                </TD>
              ))}
            </TR>
          ))}
          {key === "day" && (
            <TR className="font-semibold">
              <TD>Granja</TD>
              {COLS.map((c) => (
                <TD key={c[0]} className="text-right tabular-nums">
                  {c[2](d.totDay[c[0]] as number | null)}
                </TD>
              ))}
            </TR>
          )}
        </TBody>
      </Table>
    </Section>
  );
  return (
    <div className="space-y-4">
      <PageHeader title="Produção" description={`Dados até ${fmtDate(d.refDate)} · ${f.label}`} />
      {table("day", `Diária — ${fmtDate(d.refDate)}`)}
      {table("week", `Semanal — ${d.weekLabel}`)}
      <Section title="Postura no período">
        <TimeSeriesChart spec={d.farm} height={320} />
      </Section>
      <Section title="Curvas de postura por idade">
        <AgeCurveChart spec={d.ageCurves} height={360} />
      </Section>
      <Section title="Previsão de 8 semanas" description="Por galpão e total da granja.">
        <FarmForecast scope={scope} />
      </Section>
    </div>
  );
}
