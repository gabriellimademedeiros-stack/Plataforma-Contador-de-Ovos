import Link from "next/link";
import { EmptyState, Section } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { listEvents } from "@/server/repositories/marks";
import { getFlocks, getRefDate, currentFlockOf } from "@/server/repositories/reference";
import { EventImpactSummary } from "@/components/events/impact-summary";
import { CERTAINTY_LABEL } from "@/engine/impacts/event-types";
import { EVENT_CATEGORY_COLORS } from "@/lib/colors";
import { fmtDateTime } from "@/lib/format";
import type { Scope } from "@/server/permissions";

/** Linha do tempo do lote com retratos de impacto (Parte 14.6). */
export async function HouseEventsTab({ house }: { scope: Scope; house: string }) {
  const [flocks, refDate] = await Promise.all([getFlocks(), getRefDate()]);
  const f = currentFlockOf(flocks, house, refDate);
  const events = await listEvents({ houses: [house], from: f?.startDate, to: refDate });
  return (
    <Section title={`Linha do tempo do lote ${f?.code ?? ""}`} description="Do alojamento até hoje, com o resumo do retrato de impacto de cada evento.">
      {events.length === 0 ? (
        <EmptyState title="Nenhum evento registrado no lote" />
      ) : (
        <ol className="relative space-y-3 border-l pl-5">
          {events.map((e) => (
            <li key={e.id} className="relative">
              <span className="absolute -left-[27px] top-1.5 size-3 rounded-full ring-4 ring-white" style={{ background: EVENT_CATEGORY_COLORS[e.category] }} />
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-xs text-muted-foreground">{fmtDateTime(e.startsAt)}</span>
                <Link href={`/eventos/${e.id}`} className="font-medium text-primary hover:underline">
                  {e.title}
                </Link>
                <Badge variant="outline">{e.typeName}</Badge>
                <Badge variant={e.certainty === "confirmado" ? "ok" : "warn"}>{CERTAINTY_LABEL[e.certainty]}</Badge>
              </div>
              <EventImpactSummary eventId={e.id} />
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}
