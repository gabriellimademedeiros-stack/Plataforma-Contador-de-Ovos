import Link from "next/link";
import { BellRing, Camera, CameraOff } from "lucide-react";
import { Card } from "@/components/ui/card";
import { fmtAge, fmtDate, fmtInt, fmtNumber, fmtPP, fmtPct } from "@/lib/format";
import type { HouseCardData } from "@/server/services/farm-grid";
import { StatusDot } from "./status";

export function HouseCard({ h }: { h: HouseCardData }) {
  if (!h.flock) {
    return (
      <Card className="flex flex-col gap-2 border-dashed p-4" style={{ borderTop: `4px solid ${h.color}` }}>
        <div className="font-semibold">{h.code}</div>
        <div className="text-sm text-muted-foreground">Vazio sanitário{h.emptyUntil ? ` até ${fmtDate(h.emptyUntil)}` : ""}</div>
      </Card>
    );
  }
  return (
    <Link href={`/galpoes/${h.code}`} className="block">
      <Card className="flex h-full flex-col gap-3 p-4 transition-shadow hover:shadow-md" style={{ borderTop: `4px solid ${h.color}` }}>
        <div className="flex items-start justify-between">
          <div>
            <div className="text-lg font-semibold">{h.code}</div>
            <div className="text-xs text-muted-foreground">
              {h.flock} · {h.strain}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {h.openAlerts > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800" title="Alertas abertos">
                <BellRing className="size-3" /> {h.openAlerts}
              </span>
            )}
            <span title={`Contador: ${h.counterStatus}`}>
              {h.counterStatus === "offline" ? <CameraOff className="size-4 text-red-600" /> : <Camera className={`size-4 ${h.counterStatus === "online" ? "text-green-600" : "text-slate-400"}`} />}
            </span>
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          {fmtAge(h.ageDays)} · {h.phase}
        </div>
        <div className="text-xs">Aves presentes: <span className="font-medium tabular-nums">{fmtInt(h.birdsPresent)}</span></div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-md bg-muted/60 p-2">
            <div className="text-[11px] text-muted-foreground">Postura ontem</div>
            <div className="font-semibold tabular-nums">{fmtPct(h.posture)}</div>
            <div className="flex items-center justify-center gap-1 text-[11px]">
              <StatusDot status={h.postureStatus} className="size-2" />
              {fmtPP(h.postureDev)}
            </div>
          </div>
          <div className="rounded-md bg-muted/60 p-2">
            <div className="text-[11px] text-muted-foreground">Mort. semana</div>
            <div className="font-semibold tabular-nums">{fmtNumber(h.mortWeek, 2)}%</div>
            <StatusDot status={h.mortStatus} className="size-2" />
          </div>
          <div className="rounded-md bg-muted/60 p-2">
            <div className="text-[11px] text-muted-foreground">Avarias</div>
            <div className="font-semibold tabular-nums">{fmtNumber(h.damages, 2)}%</div>
            <StatusDot status={h.damagesStatus} className="size-2" />
          </div>
        </div>
      </Card>
    </Link>
  );
}
