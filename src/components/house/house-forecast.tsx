import { EmptyState } from "@/components/layout/page-header";
import type { Scope } from "@/server/permissions";

/** Previsão de 8 semanas do galpão (marco M9). */
export async function HouseForecast(_p: { scope: Scope; house: string }) {
  return <EmptyState title="Previsão de produção">Disponível no marco M9.</EmptyState>;
}
