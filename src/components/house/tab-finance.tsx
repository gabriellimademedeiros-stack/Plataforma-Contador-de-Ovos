import { EmptyState } from "@/components/layout/page-header";
import type { Scope } from "@/server/permissions";

/** Aba Financeiro da ficha do galpão (marco M9). */
export async function HouseFinanceTab(_p: { scope: Scope; house: string }) {
  return <EmptyState title="Financeiro do galpão">Disponível no marco M9.</EmptyState>;
}
