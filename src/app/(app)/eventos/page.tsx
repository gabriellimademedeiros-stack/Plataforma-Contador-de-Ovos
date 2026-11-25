import type { Metadata } from "next";
import Link from "next/link";
import { CalendarPlus } from "lucide-react";
import { getScope } from "@/server/services/context";
import { listEvents } from "@/server/repositories/marks";
import { getRefDate } from "@/server/repositories/reference";
import { scopedHouseCodes } from "@/server/services/metrics-query";
import { resolveFilters, type SearchParams } from "@/lib/filters";
import { PageHeader, Section, EmptyState } from "@/components/layout/page-header";
import { ParamSelect } from "@/components/layout/defect-select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CATEGORY_LABEL, CERTAINTY_LABEL } from "@/engine/impacts/event-types";
import { EVENT_CATEGORY_COLORS } from "@/lib/colors";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { EventImpactSummary } from "@/components/events/impact-summary";

export const metadata: Metadata = { title: "Eventos" };

const SOURCE_LABEL: Record<string, string> = { usuario: "Usuário", plataforma: "Plataforma", simulado: "Simulado", assistente: "Assistente" };

export default async function EventosPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const scope = await getScope();
  const f = resolveFilters(sp, await getRefDate(), "90d");
  const one = (k: string) => (typeof sp[k] === "string" && sp[k] !== "todos" ? (sp[k] as string) : null);
  const houses = await scopedHouseCodes(scope, one("galpao") ? [one("galpao")!] : null);
  const events = await listEvents({ houses, from: f.from, to: f.to, categories: one("categoria") ? [one("categoria")!] : undefined, certainty: one("certeza") ? [one("certeza")!] : undefined, source: one("origem") ? [one("origem")!] : undefined });
  const byMonth = new Map<string, typeof events>();
  for (const e of events) {
    const k = e.startDate.slice(0, 7);
    const a = byMonth.get(k) ?? [];
    a.push(e);
    byMonth.set(k, a);
  }
  const all = await scopedHouseCodes(scope);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Eventos"
        description={`${events.length} eventos · ${fmtDate(f.from)} a ${fmtDate(f.to)}`}
        actions={
          <Button asChild>
            <Link href="/eventos/novo">
              <CalendarPlus /> Registrar evento
            </Link>
          </Button>
        }
      />
      <div className="flex flex-wrap gap-2">
        <ParamSelect name="galpao" label="Galpão" value={one("galpao") ?? "todos"} options={[{ key: "todos", label: "Todos os galpões" }, ...all.map((h) => ({ key: h, label: h }))]} />
        <ParamSelect name="categoria" label="Categoria" value={one("categoria") ?? "todos"} options={[{ key: "todos", label: "Todas as categorias" }, ...Object.entries(CATEGORY_LABEL).map(([k, v]) => ({ key: k, label: v }))]} />
        <ParamSelect name="certeza" label="Certeza" value={one("certeza") ?? "todos"} options={[{ key: "todos", label: "Qualquer certeza" }, ...Object.entries(CERTAINTY_LABEL).map(([k, v]) => ({ key: k, label: v }))]} />
        <ParamSelect name="origem" label="Origem" value={one("origem") ?? "todos"} options={[{ key: "todos", label: "Qualquer origem" }, ...Object.entries(SOURCE_LABEL).map(([k, v]) => ({ key: k, label: v }))]} />
      </div>
      <Section title="Linha do tempo">
        {events.length === 0 ? (
          <EmptyState title="Nenhum evento com esses filtros" />
        ) : (
          <div className="space-y-5">
            {[...byMonth.entries()].map(([month, list]) => (
              <div key={month}>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{new Date(`${month}-15`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</div>
                <ol className="relative space-y-3 border-l pl-5">
                  {list.map((e) => (
                    <li key={e.id} className="relative">
                      <span className="absolute -left-[27px] top-1.5 size-3 rounded-full ring-4 ring-white" style={{ background: EVENT_CATEGORY_COLORS[e.category] }} />
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="text-xs text-muted-foreground">{fmtDateTime(e.startsAt)}</span>
                        <Link href={`/eventos/${e.id}`} className="font-medium text-primary hover:underline">
                          {e.title}
                        </Link>
                        <Badge variant="outline">{e.typeName}</Badge>
                        <span className="text-xs">{e.houses.join(", ")}</span>
                        <Badge variant={e.certainty === "confirmado" ? "ok" : e.certainty === "descartado" ? "secondary" : "warn"}>{CERTAINTY_LABEL[e.certainty]}</Badge>
                        <span className="text-xs text-muted-foreground">origem: {SOURCE_LABEL[e.source] ?? e.source}</span>
                      </div>
                      <EventImpactSummary eventId={e.id} />
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
