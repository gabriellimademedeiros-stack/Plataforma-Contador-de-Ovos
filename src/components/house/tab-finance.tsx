import Link from "next/link";
import { getSql } from "@/db/client";
import { addDays, lastCompleteWeekStart } from "@/lib/dates";
import { Section } from "@/components/layout/page-header";
import { BarChart, TimeSeriesChart, Waterfall } from "@/components/charts";
import { EstimatedBadge } from "@/components/kpi/status";
import { Button } from "@/components/ui/button";
import { marginBridge } from "@/engine/finance/bridge";
import { readWeekly } from "@/server/services/metrics-query";
import { weekFinance } from "@/server/services/finance";
import { getFlocks, getRefDate, currentFlockOf } from "@/server/repositories/reference";
import { fmtBRL, fmtNumber, fmtPP } from "@/lib/format";
import type { Scope } from "@/server/permissions";

/** Aba Financeiro da ficha do galpão (Parte 14.6). */
export async function HouseFinanceTab({ scope, house }: { scope: Scope; house: string }) {
  const refDate = await getRefDate();
  const ws = lastCompleteWeekStart(refDate);
  const from = addDays(ws, -7 * 15);
  const rows = await readWeekly(scope, { houses: [house], metrics: ["fin.receita", "fin.custo", "fin.margem", "fin.margem_dz", "fin.postura_equilibrio", "prod.postura", "prod.ovos", "nut.racao"], from, to: ws });
  const weeks = Array.from(new Set(rows.filter((r) => r.daysCount >= 7).map((r) => r.weekStart))).sort();
  const v = (w: string, m: string) => rows.find((r) => r.weekStart === w && r.metric === m)?.value ?? null;
  const [cur] = await weekFinance(scope, ws, [house]);
  const sql = getSql();
  const prices = await sql`select week_start, item, value_brl from app.prices where week_start between ${from} and ${ws}`;
  const price = (w: string, item: string) => Number(prices.find((p) => String(p.week_start instanceof Date ? p.week_start.toISOString() : p.week_start).slice(0, 10) === w && p.item === item)?.value_brl ?? 0);
  const wf = (w: string) => ({ weekStart: w, margin: v(w, "fin.margem") ?? 0, dozens: (v(w, "prod.ovos") ?? 0) / 12, eggPrice: price(w, "ovo_comercial_dz"), feedKg: (rows.find((r) => r.weekStart === w && r.metric === "nut.racao")?.num ?? 0) / 1000, feedPrice: price(w, "racao_kg") });
  const last = weeks.at(-1);
  const refW = last ? [...weeks].reverse().slice(1).find((w) => (v(w, "fin.margem") ?? -1) >= 0) ?? weeks[Math.max(0, weeks.length - 9)] : null;
  const bridge = last && refW && refW !== last ? marginBridge(wf(refW), wf(last)) : null;
  const flock = currentFlockOf(await getFlocks(), house, refDate);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <EstimatedBadge />
        {cur && (
          <span className="text-sm">
            Última semana completa: postura {fmtNumber(cur.posture, 1)}% · equilíbrio {fmtNumber(cur.breakEven, 1)}% · folga {fmtPP(cur.posture != null && cur.breakEven != null ? cur.posture - cur.breakEven : null)} · margem {fmtBRL(cur.sum.margem, 0)} ({fmtBRL(cur.margemDz)}/dz)
          </span>
        )}
        {flock && (
          <Button asChild size="sm" variant="outline" className="ml-auto">
            <Link href={`/financeiro?aba=descarte&lote=${flock.code}`}>Decisão de descarte do {flock.code}</Link>
          </Button>
        )}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Receita, custo e margem por semana">
          <TimeSeriesChart spec={{ kind: "timeseries", unit: "R$", decimals: 0, series: [{ name: "Receita", color: "#16a34a", data: weeks.map((w) => [w, v(w, "fin.receita")]) }, { name: "Custo", color: "#dc2626", data: weeks.map((w) => [w, v(w, "fin.custo")]) }, { name: "Margem", type: "bar", color: "#1e3a5f", data: weeks.map((w) => [w, v(w, "fin.margem")]) }] }} />
        </Section>
        <Section title="Postura real × postura de equilíbrio">
          <TimeSeriesChart spec={{ kind: "timeseries", unit: "%", decimals: 1, series: [{ name: "Postura real", color: "#1e3a5f", data: weeks.map((w) => [w, v(w, "prod.postura")]) }, { name: "Postura de equilíbrio", color: "#dc2626", dashed: true, data: weeks.map((w) => [w, v(w, "fin.postura_equilibrio")]) }] }} />
        </Section>
        {cur && (
          <Section title="Custos por tipo (última semana)">
            <BarChart spec={{ kind: "bar", unit: "R$", decimals: 0, categories: ["Ração", "Embalagem", "Overhead", "Fixos", "Franga", "Sanidade"], series: [{ name: "Custo", type: "bar", data: [["Ração", cur.sum.custoRacao], ["Embalagem", cur.sum.custoEmbalagem], ["Overhead", cur.sum.custoOverhead], ["Fixos", cur.sum.custoFixo], ["Franga", cur.sum.custoAve], ["Sanidade", cur.sum.custoSanidade]] }] }} />
          </Section>
        )}
        {bridge && (
          <Section title="Ponte da margem" description={bridge.sentence}>
            <Waterfall spec={{ kind: "waterfall", unit: "R$", decimals: 0, series: [{ name: "Ponte", data: bridge.steps.map((s) => [s.label, s.value]) }] }} />
          </Section>
        )}
        <Section title="Margem por dúzia" className="xl:col-span-2">
          <BarChart spec={{ kind: "bar", unit: "R$/dz", decimals: 2, categories: weeks.map((w) => `${w.slice(8, 10)}/${w.slice(5, 7)}`), series: [{ name: "Margem/dz", type: "bar", data: weeks.map((w) => [`${w.slice(8, 10)}/${w.slice(5, 7)}`, v(w, "fin.margem_dz")]), colors: weeks.map((w) => ((v(w, "fin.margem_dz") ?? 0) < 0 ? "#dc2626" : "#16a34a")) }], refLines: [{ name: "meta R$ 0,20", y: 0.2, color: "#16a34a", dashed: true }] }} />
        </Section>
      </div>
    </div>
  );
}
