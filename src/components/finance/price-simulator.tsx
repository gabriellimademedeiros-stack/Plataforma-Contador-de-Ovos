"use client";
import { useMemo, useState } from "react";
import { Slider } from "@/components/ui/misc";
import { BarChart } from "@/components/charts";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { simulatePrices, type PriceSimHouse } from "@/engine/finance/price-sim";
import { STATUS_BG } from "@/components/kpi/status";
import { fmtBRL, fmtNumber, fmtPP, fmtSignedPct } from "@/lib/format";

/** Simulador de preços (Parte 12.4): recalcula no navegador a cada movimento. */
export function PriceSimulator({ houses, weekLabel }: { houses: PriceSimHouse[]; weekLabel: string }) {
  const baseEgg = houses[0]?.currentEgg ?? 5;
  const baseFeed = houses[0]?.currentFeed ?? 2;
  const [egg, setEgg] = useState(baseEgg);
  const [pct, setPct] = useState(0);
  const [feed, setFeed] = useState(baseFeed);
  const eff = egg * (1 + pct / 100);
  const rows = useMemo(() => houses.map((h) => ({ cur: simulatePrices(h, h.currentEgg, h.currentFeed), sim: simulatePrices(h, eff, feed) })), [houses, eff, feed]);
  const tot = rows.reduce((a, r) => a + r.sim.margem, 0);
  const totCur = rows.reduce((a, r) => a + r.cur.margem, 0);
  const color = (m: number | null) => (m == null ? "cinza" : m >= 0.2 ? "verde" : m >= 0 ? "amarelo" : "vermelho");
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Quantidades da {weekLabel.toLowerCase()} (última semana completa). Valores estimados.</p>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border p-3">
          <div className="flex justify-between text-sm">
            <span>Preço do ovo comercial</span>
            <b>{fmtBRL(egg)}/dz</b>
          </div>
          <Slider className="mt-3" min={3.5} max={7} step={0.01} value={[egg]} onValueChange={(v) => setEgg(v[0])} aria-label="Preço do ovo" />
        </div>
        <div className="rounded-lg border p-3">
          <div className="flex justify-between text-sm">
            <span>Variação do preço do ovo</span>
            <b>{fmtSignedPct(pct, 0)}</b>
          </div>
          <Slider className="mt-3" min={-30} max={30} step={1} value={[pct]} onValueChange={(v) => setPct(v[0])} aria-label="Variação percentual" />
        </div>
        <div className="rounded-lg border p-3">
          <div className="flex justify-between text-sm">
            <span>Preço da ração</span>
            <b>{fmtBRL(feed)}/kg</b>
          </div>
          <Slider className="mt-3" min={1.4} max={2.8} step={0.01} value={[feed]} onValueChange={(v) => setFeed(v[0])} aria-label="Preço da ração" />
        </div>
      </div>
      <div className="rounded-lg bg-slate-50 p-3 text-sm">
        Preço efetivo do ovo: <b>{fmtBRL(eff)}/dz</b> · Margem semanal da granja: <b>{fmtBRL(tot, 0)}</b> (atual {fmtBRL(totCur, 0)}) ·{" "}
        Galpões no vermelho: <b>{rows.filter((r) => r.sim.margem < 0).map((r) => r.sim.house).join(", ") || "nenhum"}</b>
      </div>
      <BarChart spec={{ kind: "bar", title: "Margem semanal simulada por galpão", unit: "R$", decimals: 0, categories: rows.map((r) => r.sim.house), series: [{ name: "Simulada", type: "bar", data: rows.map((r) => [r.sim.house, r.sim.margem]), colors: rows.map((r) => (r.sim.margem < 0 ? "#dc2626" : "#16a34a")) }, { name: "Atual", type: "bar", color: "#cbd5e1", data: rows.map((r) => [r.cur.house, r.cur.margem]) }], refLines: [{ name: "zero", y: 0, color: "#111827" }] }} height={300} />
      <Table>
        <THead>
          <TR>
            <TH>Galpão</TH>
            <TH className="text-right">Receita</TH>
            <TH className="text-right">Custo</TH>
            <TH className="text-right">Margem</TH>
            <TH className="text-right">Margem/dz</TH>
            <TH className="text-right">Postura</TH>
            <TH className="text-right">Equilíbrio</TH>
            <TH className="text-right">Folga</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map(({ sim }) => (
            <TR key={sim.house}>
              <TD className="font-medium">{sim.house}</TD>
              <TD className="text-right tabular-nums">{fmtBRL(sim.receita, 0)}</TD>
              <TD className="text-right tabular-nums">{fmtBRL(sim.custo, 0)}</TD>
              <TD className="p-0.5 text-right">
                <span className={`block rounded px-2 py-1 tabular-nums ${STATUS_BG[color(sim.margemDz)]}`}>{fmtBRL(sim.margem, 0)}</span>
              </TD>
              <TD className="text-right tabular-nums">{fmtBRL(sim.margemDz)}</TD>
              <TD className="text-right tabular-nums">{fmtNumber(sim.posture, 1)}%</TD>
              <TD className="text-right tabular-nums">{fmtNumber(sim.breakEven, 1)}%</TD>
              <TD className="text-right tabular-nums">{fmtPP(sim.posture != null && sim.breakEven != null ? sim.posture - sim.breakEven : null)}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
