import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Sparkline } from "@/components/charts/sparkline";
import { STATUS_COLORS } from "@/lib/colors";
import { fmtBRL, fmtNumber, fmtPP, fmtSigned } from "@/lib/format";
import type { KpiCardData } from "@/server/services/home";
import { EstimatedBadge, StatusDot } from "./status";

function fmtValue(c: KpiCardData) {
  if (c.value == null) return "—";
  if (c.unit === "R$") return fmtBRL(c.value, c.decimals);
  if (c.unit === "%") return `${fmtNumber(c.value, c.decimals)}%`;
  return fmtNumber(c.value, c.decimals);
}

export function KpiCard({ c }: { c: KpiCardData }) {
  const d = c.deltaPrev;
  const up = d != null && d > 0;
  const good = d == null || c.better === "none" ? null : c.better === "up" ? up : !up;
  const Icon = d == null || Math.abs(d) < 1e-9 ? Minus : up ? ArrowUp : ArrowDown;
  const deltaText =
    d == null ? "—" : c.deltaKind === "pp" ? fmtPP(d, c.decimals) : c.unit === "R$" ? fmtSigned(d, 0, "").replace(/^([+−]?)/, "$1R$ ") : fmtSigned(d, c.decimals);
  return (
    <Card className="flex flex-col gap-2 p-4" style={{ borderTop: `3px solid ${STATUS_COLORS[c.status]}` }}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-medium text-muted-foreground">{c.title}</div>
        <div className="flex items-center gap-1">
          {c.finance && <EstimatedBadge />}
          <StatusDot status={c.status} />
        </div>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div>
          <div className="text-2xl font-semibold whitespace-nowrap tabular-nums">
            {fmtValue(c)}
            {c.unit !== "%" && c.unit !== "R$" && c.value != null && <span className="ml-1 text-xs font-normal text-muted-foreground">{c.unit}</span>}
          </div>
          {c.secondary && <div className="text-xs text-muted-foreground">{c.secondary}</div>}
        </div>
        <Sparkline data={c.spark} width={c.finance ? 90 : 120} color={STATUS_COLORS[c.status === "cinza" ? "cinza" : c.status]} />
      </div>
      <div className="flex items-center gap-1 text-xs">
        <span className={good == null ? "text-muted-foreground" : good ? "text-green-700" : "text-red-700"}>
          <Icon className="inline size-3" /> {deltaText}
        </span>
        <span className="text-muted-foreground">vs semana anterior</span>
      </div>
      {c.reference && <div className="text-[11px] text-muted-foreground">{c.reference}</div>}
    </Card>
  );
}
