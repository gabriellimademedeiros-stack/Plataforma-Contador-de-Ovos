import { PageHeader } from "@/components/layout/page-header";
import { ComparisonBuilder } from "@/components/comparisons/builder";
import { getScope } from "@/server/services/context";
import { getFlocks, getRefDate } from "@/server/repositories/reference";
import { listEvents } from "@/server/repositories/marks";
import { METRICS } from "@/engine/metrics/catalog";
import { addDays } from "@/lib/dates";

export const metadata = { title: "Comparativos" };

export default async function ComparativosPage() {
  const [scope, flocks, ref] = await Promise.all([getScope(), getFlocks(), getRefDate()]);
  const houses = [...scope.houseCodes].sort();
  const events = await listEvents({ houses, from: addDays(ref, -365), to: ref });
  const metrics = METRICS.filter((m) => !m.internal && (!m.finance || scope.canSeeFinance) && !m.code.startsWith("ops.")).map((m) => ({ code: m.code, name: m.name, group: m.group }));
  return (
    <div className="space-y-4">
      <PageHeader title="Comparativos" description="Monte comparações entre galpões, lotes (na mesma idade), linhagens, períodos ou antes × depois de um evento. Salve como favorito ou baixe em CSV." />
      <ComparisonBuilder
        houses={houses}
        flocks={flocks.filter((f) => scope.houseCodes.has(f.houseCode)).map((f) => ({ code: f.code, house: f.houseCode, strain: f.strainCode, status: f.status, start: f.startDate, end: f.endDate }))}
        strains={Array.from(new Set(flocks.map((f) => f.strainCode))).sort()}
        metrics={metrics}
        events={events.filter((e) => e.certainty !== "descartado").slice(0, 150).map((e) => ({ id: e.id, label: `${e.startDate.split("-").reverse().join("/")} · ${e.houses.length > 3 ? `${e.houses.length} galpões` : e.houses.join(", ")} · ${e.title}` }))}
        refDate={ref}
      />
    </div>
  );
}
