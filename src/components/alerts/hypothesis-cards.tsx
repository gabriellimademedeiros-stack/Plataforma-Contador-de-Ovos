"use client";
import { useState } from "react";
import { CircleCheck, CircleHelp, CircleMinus, CircleX, Star } from "lucide-react";
import type { HypothesisView } from "@/server/services/alert-detail";

const CONF: Record<string, { label: string; cls: string; bar: string }> = {
  alta: { label: "Confiança alta", cls: "bg-green-100 text-green-800", bar: "bg-green-600" },
  media: { label: "Confiança média", cls: "bg-amber-100 text-amber-800", bar: "bg-amber-500" },
  baixa: { label: "Confiança baixa", cls: "bg-gray-100 text-gray-700", bar: "bg-gray-400" },
};

export function HypothesisCards({ hypotheses }: { hypotheses: HypothesisView[] }) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {hypotheses.slice(0, 5).map((h, i) => (
        <Card key={h.code} h={h} rank={i + 1} />
      ))}
    </div>
  );
}

function Card({ h, rank }: { h: HypothesisView; rank: number }) {
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const c = CONF[h.confidence] ?? CONF.baixa;
  return (
    <div className={`rounded-xl border p-3 ${rank === 1 ? "border-primary/40 bg-primary/5" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs text-muted-foreground">{rank}ª hipótese</div>
          <div className="font-semibold">{h.name}</div>
        </div>
        <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${c.cls}`}>{c.label}</span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
          <div className={`h-full ${c.bar}`} style={{ width: `${Math.max(2, Math.min(100, h.score))}%` }} />
        </div>
        <span className="w-10 text-right text-sm font-semibold tabular-nums">{Math.round(h.score)}</span>
      </div>
      {h.confidenceReason && <div className="mt-1 text-[11px] text-muted-foreground">{h.confidenceReason}</div>}
      <ul className="mt-2 space-y-1 text-sm">
        {h.bonus.map((b) => (
          <li key={b.signal} className="flex gap-1.5 text-violet-800">
            <Star className="mt-0.5 size-3.5 shrink-0" /> {b.text}
          </li>
        ))}
        {h.for.map((s) => (
          <li key={s.signal} className="flex gap-1.5 text-green-800">
            <CircleCheck className="mt-0.5 size-3.5 shrink-0" /> {s.text}
          </li>
        ))}
        {h.against.map((s) => (
          <li key={s.signal} className="flex gap-1.5 text-red-800">
            <CircleX className="mt-0.5 size-3.5 shrink-0" /> {s.text}
          </li>
        ))}
        {h.absent.slice(0, 3).map((s) => (
          <li key={s.signal} className="flex gap-1.5 text-muted-foreground">
            <CircleMinus className="mt-0.5 size-3.5 shrink-0" /> {s.text}
          </li>
        ))}
        {h.unverifiable.map((s) => (
          <li key={s.signal} className="flex gap-1.5 text-gray-500">
            <CircleHelp className="mt-0.5 size-3.5 shrink-0" /> {s.text}
          </li>
        ))}
      </ul>
      {h.checks.length > 0 && (
        <div className="mt-2 rounded-md bg-muted/50 p-2">
          <div className="text-xs font-medium">O que verificar</div>
          <ul className="mt-1 space-y-0.5">
            {h.checks.map((t, i) => (
              <li key={i}>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!checked[i]} onChange={(e) => setChecked({ ...checked, [i]: e.target.checked })} />
                  <span className={checked[i] ? "line-through text-muted-foreground" : ""}>{t}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
