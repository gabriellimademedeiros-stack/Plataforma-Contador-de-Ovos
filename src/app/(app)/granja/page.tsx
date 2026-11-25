import type { Metadata } from "next";
import { getScope } from "@/server/services/context";
import { getFarmGrid } from "@/server/services/farm-grid";
import { PageHeader } from "@/components/layout/page-header";
import { HouseCard } from "@/components/kpi/house-card";
import { fmtDate } from "@/lib/format";

export const metadata: Metadata = { title: "Granja" };

export default async function GranjaPage() {
  const scope = await getScope();
  const { refDate, houses } = await getFarmGrid(scope);
  return (
    <div>
      <PageHeader title="Granja" description={`Galpões na ordem física · situação em ${fmtDate(refDate)}`} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {houses.map((h) => (
          <HouseCard key={h.code} h={h} />
        ))}
      </div>
    </div>
  );
}
