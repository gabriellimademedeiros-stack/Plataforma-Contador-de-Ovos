import type { Metadata } from "next";
import Link from "next/link";
import { getScope } from "@/server/services/context";
import { getHealthPage } from "@/server/services/thematic";
import { getRefDate } from "@/server/repositories/reference";
import { resolveFilters, type SearchParams } from "@/lib/filters";
import { AgeCurveChart, BarChart, TimeSeriesChart } from "@/components/charts";
import { PageHeader, Section, EmptyState } from "@/components/layout/page-header";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CERTAINTY_LABEL } from "@/engine/impacts/event-types";
import { fmtDate } from "@/lib/format";
import { EventImpactSummary } from "@/components/events/impact-summary";

export const metadata: Metadata = { title: "Sanidade" };

export default async function SanidadePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const scope = await getScope();
  const f = resolveFilters(await searchParams, await getRefDate());
  const d = await getHealthPage(scope, f.days);
  return (
    <div className="space-y-4">
      <PageHeader title="Sanidade e mortalidade" description={`${fmtDate(d.from)} a ${fmtDate(d.to)}`} />
      <Section title="Mortalidade diária">
        <TimeSeriesChart spec={d.farm} height={300} />
      </Section>
      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Acumulada × curva">
          <AgeCurveChart spec={d.cumulative} height={320} />
        </Section>
        <Section title="Mortes por causa">
          <BarChart spec={d.causes} height={320} />
        </Section>
      </div>
      <Section title="Calendário de vacinas" description="Registradas, previstas aos 30, 45, 60 e 75 semanas, e atrasadas.">
        <Table>
          <THead>
            <TR>
              <TH>Galpão</TH>
              <TH>Lote</TH>
              <TH>Semana</TH>
              <TH>Data prevista</TH>
              <TH>Registro</TH>
              <TH>Situação</TH>
            </TR>
          </THead>
          <TBody>
            {d.calendar.map((c) => (
              <TR key={`${c.house}-${c.week}`}>
                <TD className="font-medium">{c.house}</TD>
                <TD>{c.flock}</TD>
                <TD>{c.week}</TD>
                <TD>{fmtDate(c.due)}</TD>
                <TD>{fmtDate(c.done)}</TD>
                <TD>
                  <Badge variant={c.status === "registrada" ? "ok" : c.status === "atrasada" ? "bad" : "secondary"}>{c.status}</Badge>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Section>
      <Section title="Eventos sanitários (últimos 120 dias)" description="Com o resumo do retrato de impacto.">
        {d.sanitary.length === 0 ? (
          <EmptyState title="Nenhum evento sanitário" />
        ) : (
          <ul className="divide-y">
            {d.sanitary.map((e) => (
              <li key={e.id} className="py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground">{fmtDate(e.startDate)}</span>
                  <Link href={`/eventos/${e.id}`} className="font-medium text-primary hover:underline">
                    {e.title}
                  </Link>
                  <span className="text-xs text-muted-foreground">{e.houses.join(", ")}</span>
                  <Badge variant="outline">{CERTAINTY_LABEL[e.certainty]}</Badge>
                </div>
                <EventImpactSummary eventId={e.id} />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
