import { STATUS_COLORS, type StatusColor } from "@/lib/colors";
import { cn } from "@/lib/utils";

export const STATUS_BG: Record<StatusColor, string> = {
  verde: "bg-green-100 text-green-900",
  amarelo: "bg-amber-100 text-amber-900",
  vermelho: "bg-red-100 text-red-900",
  cinza: "bg-gray-100 text-gray-600",
};

export const STATUS_LABEL: Record<StatusColor, string> = {
  verde: "dentro da meta",
  amarelo: "atenção",
  vermelho: "fora da meta",
  cinza: "sem dado / não verificável",
};

export function StatusDot({ status, className }: { status: StatusColor; className?: string }) {
  return <span className={cn("inline-block size-2.5 rounded-full", className)} style={{ background: STATUS_COLORS[status] }} title={STATUS_LABEL[status]} />;
}

export function EstimatedBadge() {
  return <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">Estimado</span>;
}
