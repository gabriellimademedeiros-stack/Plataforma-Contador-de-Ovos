import type { Metadata } from "next";
import { getScope } from "@/server/services/context";
import { scopedHouseCodes } from "@/server/services/metrics-query";
import { PageHeader } from "@/components/layout/page-header";
import { EventForm } from "@/components/events/event-form";
import { EVENT_TYPES } from "@/engine/impacts/event-types";
import type { SearchParams } from "@/lib/filters";

export const metadata: Metadata = { title: "Registrar evento" };

export default async function NovoEventoPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const scope = await getScope();
  const houses = await scopedHouseCodes(scope);
  const types = EVENT_TYPES.filter((t) => t.category !== "detectado");
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Registrar evento" description="Data retroativa é permitida. O retrato de impacto é recalculado na hora." />
      <EventForm
        houses={houses}
        types={types}
        initial={{ house: typeof sp.galpao === "string" ? sp.galpao.toUpperCase() : undefined, type: typeof sp.tipo === "string" ? sp.tipo : undefined, alertId: typeof sp.alerta === "string" ? sp.alerta : undefined }}
      />
    </div>
  );
}
