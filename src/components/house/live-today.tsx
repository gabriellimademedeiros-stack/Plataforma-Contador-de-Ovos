"use client";
/** Cartão "Hoje (parcial, ao vivo)" (Parte 16.1): aparece quando há dados do dia corrente; atualiza a cada 5 segundos. */
import { useEffect, useState } from "react";
import { Radio } from "lucide-react";

interface Live {
  day: string;
  eggs: number | null;
  boxes: number | null;
  posturePartial: number | null;
  hoursOfCount: number;
  countMinutes: number;
  water: number | null;
  waterRatio: number | null;
  tempMax: number | null;
  deaths: number | null;
  deathsVsMedian: number | null;
  feedPerBird: number | null;
  lastUpdate: string | null;
}

const nf = (v: number | null | undefined, d = 0) => (v == null ? "—" : new Intl.NumberFormat("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v));

export function LiveTodayCard({ house }: { house: string }) {
  const [d, setD] = useState<Live | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(`/api/galpoes/${house}/hoje`)
        .then((r) => (r.ok ? r.json() : { hoje: null }))
        .then((j) => alive && setD(j.hoje))
        .catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [house]);
  if (!d) return null;
  const items = [
    { label: "Ovos contados hoje", value: d.eggs != null ? `${nf(d.eggs)} (${nf(d.boxes)} cx)` : "—", sub: d.countMinutes ? `${nf(d.countMinutes)} min de contagem` : "sem contagem ao vivo" },
    { label: "Mortes hoje", value: nf(d.deaths), sub: d.deathsVsMedian != null ? `${nf(d.deathsVsMedian, 1)} × a mediana de 14 dias` : "" },
    { label: "Água hoje", value: d.water != null ? `${nf(d.water)} L` : "—", sub: d.waterRatio != null ? `${nf(d.waterRatio * 100)}% do normal para o horário` : "" , warn: d.waterRatio != null && d.waterRatio <= 0.85 },
    { label: "Temperatura máx. hoje", value: d.tempMax != null ? `${nf(d.tempMax, 1)} °C` : "—", sub: "", warn: d.tempMax != null && d.tempMax > 32 },
    { label: "Ração hoje", value: d.feedPerBird != null ? `${nf(d.feedPerBird, 1)} g/ave` : "—", sub: "apontada no campo" },
  ];
  return (
    <section className="rounded-xl border-2 border-emerald-500/60 bg-emerald-50/40 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-900">
        <Radio className="size-4 animate-pulse text-emerald-600" /> Hoje (parcial, ao vivo)
        <span className="font-normal text-emerald-800/80">· atualiza a cada 5 s{d.lastUpdate ? ` · último dado às ${new Date(d.lastUpdate).toLocaleTimeString("pt-BR", { timeZone: "America/Fortaleza", hour: "2-digit", minute: "2-digit" })}` : ""}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {items.map((i) => (
          <div key={i.label} className="rounded-lg border bg-white p-2">
            <div className="text-[11px] text-slate-500">{i.label}</div>
            <div className={`text-lg font-semibold tabular-nums ${i.warn ? "text-red-700" : ""}`}>{i.value}</div>
            {i.sub && <div className="text-[11px] text-slate-500">{i.sub}</div>}
          </div>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-slate-500">Dia em andamento: números parciais, fora dos indicadores do dia (que fecham às 06h).</p>
    </section>
  );
}
