import { EmptyState } from "@/components/layout/page-header";
import type { Scope } from "@/server/permissions";

/** Previsão de 8 semanas por galpão e total (marco M9). */
export async function FarmForecast(_p: { scope: Scope }) {
  return <EmptyState title="Previsão de produção">Disponível no marco M9.</EmptyState>;
}
