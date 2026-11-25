import { EmptyState } from "@/components/layout/page-header";
import type { Scope } from "@/server/permissions";

/** Aba Eventos da ficha do galpão (marco M6). */
export async function HouseEventsTab(_p: { scope: Scope; house: string }) {
  return <EmptyState title="Linha do tempo do lote">Disponível no marco M6.</EmptyState>;
}
