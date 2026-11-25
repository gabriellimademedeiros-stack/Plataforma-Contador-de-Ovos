import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/layout/page-header";
import { SEVERITY_LABEL } from "@/engine/impacts/event-types";
import { fmtDate, confidenceLabel } from "@/lib/format";
import type { AlertListItem } from "@/server/repositories/marks";

export const STATUS_ALERT_LABEL: Record<string, string> = {
  aberto: "Aberto",
  reconhecido: "Reconhecido",
  em_investigacao: "Em investigação",
  resolvido: "Resolvido",
  descartado: "Descartado",
};
const SEV: Record<string, "bad" | "warn" | "info" | "purple"> = { critica: "bad", alta: "bad", media: "warn", baixa: "info", aviso: "purple" };
const ST: Record<string, "bad" | "warn" | "ok" | "secondary" | "info"> = { aberto: "bad", reconhecido: "warn", em_investigacao: "info", resolvido: "ok", descartado: "secondary" };

export function AlertTable({ alerts, compact = false }: { alerts: AlertListItem[]; compact?: boolean }) {
  if (alerts.length === 0) return <EmptyState title="Nenhum alerta" />;
  return (
    <Table>
      <THead>
        <TR>
          <TH>Alerta</TH>
          {!compact && <TH>Galpão</TH>}
          <TH>Regra</TH>
          <TH>Severidade</TH>
          <TH>Situação</TH>
          <TH>Aberto em</TH>
          {!compact && <TH>Hipótese principal</TH>}
        </TR>
      </THead>
      <TBody>
        {alerts.map((a) => (
          <TR key={a.id}>
            <TD className="max-w-[28rem] truncate">
              <Link href={`/alertas/${a.id}`} className="font-medium text-primary hover:underline">
                {a.title}
              </Link>
            </TD>
            {!compact && <TD>{a.house ?? "Granja"}</TD>}
            <TD className="font-mono text-xs">{a.ruleCode}</TD>
            <TD>
              <Badge variant={SEV[a.severity] ?? "secondary"}>{SEVERITY_LABEL[a.severity] ?? a.severity}</Badge>
            </TD>
            <TD>
              <Badge variant={ST[a.status] ?? "secondary"}>{STATUS_ALERT_LABEL[a.status] ?? a.status}</Badge>
            </TD>
            <TD>{fmtDate(a.openedOn)}</TD>
            {!compact && <TD className="text-xs">{a.topHypothesis ? `${a.topHypothesis.name} (${confidenceLabel(a.topHypothesis.confidence)})` : "—"}</TD>}
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
