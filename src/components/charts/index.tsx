"use client";
/**
 * Componentes de gráfico da Parte 14.2. Todos recebem dados já calculados no servidor (motor + serviços).
 */
import { useId } from "react";
import { EChart } from "./echart";
import type { ChartSpec } from "./types";

type P = { spec: ChartSpec; height?: number; hideToolbar?: boolean };

/** Linha por data ou por idade, com referência, faixa do padrão interno, eventos (faixas e bandeiras clicáveis) e alertas. */
export function TimeSeriesChart(p: P) {
  return <EChart spec={{ ...p.spec, kind: p.spec.kind === "age" ? "age" : "timeseries" }} height={p.height} hideToolbar={p.hideToolbar} />;
}

/** 2 a 4 gráficos empilhados com o mesmo eixo de tempo, cursor e zoom sincronizados (echarts.connect). */
export function SyncedPanel({ specs, height = 170, title }: { specs: ChartSpec[]; height?: number; title?: string }) {
  const group = `sync-${useId()}`;
  return (
    <div className="space-y-1">
      {title && <div className="text-sm font-semibold">{title}</div>}
      {specs.map((s, i) => {
        const last = i === specs.length - 1;
        return <EChart key={i} spec={{ ...s, kind: "timeseries", compact: !last, subtitle: s.unit ? `${s.subtitle ? s.subtitle + " · " : ""}${s.unit}` : s.subtitle }} group={group} height={last ? height + 50 : height} />;
      })}
    </div>
  );
}

/** Métrica por semana de idade: lote atual, curva da linhagem, faixa do padrão interno e lotes anteriores em cinza. */
export function AgeCurveChart(p: P) {
  return <EChart spec={{ ...p.spec, kind: "age", xType: "value", xLabel: p.spec.xLabel ?? "Semana de idade" }} height={p.height} hideToolbar={p.hideToolbar} />;
}

/** Galpão × dia ou hora × dia. */
export function Heatmap(p: P) {
  return <EChart spec={{ ...p.spec, kind: "heatmap" }} height={p.height} hideToolbar={p.hideToolbar} />;
}

/** Barras horizontais ordenadas (com contribuição por componente quando empilhadas). */
export function RankingBars(p: P) {
  return <EChart spec={{ ...p.spec, kind: "hbar" }} height={p.height} hideToolbar={p.hideToolbar} />;
}

export function BarChart(p: P) {
  return <EChart spec={{ ...p.spec, kind: "bar" }} height={p.height} hideToolbar={p.hideToolbar} />;
}

/** Barras de defeitos ou causas com linha acumulada. */
export function Pareto(p: P) {
  return <EChart spec={{ ...p.spec, kind: "pareto" }} height={p.height} hideToolbar={p.hideToolbar} />;
}

/** Decomposição do desvio e ponte de margem: aumento verde, redução vermelha, totais cinza. */
export function Waterfall(p: P) {
  return <EChart spec={{ ...p.spec, kind: "waterfall" }} height={p.height} hideToolbar={p.hideToolbar} />;
}

/** Média e limites (±2 e ±3 desvios). */
export function ControlChart(p: P) {
  return <EChart spec={{ ...p.spec, kind: "control" }} height={p.height} hideToolbar={p.hideToolbar} />;
}

/** Dispersão com linha de tendência. */
export function ScatterTrend(p: P) {
  return <EChart spec={{ ...p.spec, kind: "scatter", xType: "value" }} height={p.height} hideToolbar={p.hideToolbar} />;
}

/** Unidade Haugh por dia de armazenamento, um traço por teste. */
export function ShelfLifeChart(p: P) {
  return <EChart spec={{ ...p.spec, kind: "shelf", xType: "value", xLabel: "Dias de armazenamento" }} height={p.height} hideToolbar={p.hideToolbar} />;
}

/** Histórico + projeção com faixa de incerteza. */
export function ForecastChart(p: P) {
  return <EChart spec={{ ...p.spec, kind: "forecast" }} height={p.height} hideToolbar={p.hideToolbar} />;
}

/** Desenha a especificação devolvida por `gerar_grafico` (várias métricas = painel sincronizado). */
export function ChartFromSpec({ spec, specs }: { spec?: ChartSpec; specs?: ChartSpec[] }) {
  if (specs && specs.length > 1) return <SyncedPanel specs={specs} />;
  const s = spec ?? specs?.[0];
  if (!s) return null;
  return <EChart spec={s} />;
}

export { EChart };
export type { ChartSpec };
