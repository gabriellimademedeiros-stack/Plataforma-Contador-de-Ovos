/**
 * Especificação de gráfico serializável (servidor → cliente). Também é o formato devolvido pela
 * ferramenta `gerar_grafico` do assistente e desenhado por ChartFromSpec.
 */
export type XValue = string | number;

export interface SeriesSpec {
  name: string;
  data: Array<[XValue, number | null]>;
  type?: "line" | "bar" | "scatter";
  color?: string;
  dashed?: boolean;
  dotted?: boolean;
  area?: boolean;
  /** 0 = eixo esquerdo; 1 = eixo direito */
  yAxis?: 0 | 1;
  stack?: string;
  width?: number;
  symbol?: boolean;
  smooth?: boolean;
  step?: boolean;
  /** Série cinza de fundo (lotes anteriores) */
  muted?: boolean;
}

export interface BandSpec {
  name: string;
  lower: Array<[XValue, number | null]>;
  upper: Array<[XValue, number | null]>;
  color?: string;
}

export interface EventMark {
  id: string;
  label: string;
  category: string;
  from: XValue;
  to?: XValue | null;
}

export interface AlertMark {
  id: string;
  label: string;
  x: XValue;
  y: number | null;
  severity: string;
}

export interface RefLine {
  name: string;
  y?: number;
  x?: XValue;
  color?: string;
  dashed?: boolean;
}

export interface ChartSpec {
  kind: "timeseries" | "age" | "bar" | "hbar" | "scatter" | "heatmap" | "waterfall" | "pareto" | "control" | "shelf" | "forecast";
  title?: string;
  subtitle?: string;
  unit?: string;
  unit2?: string;
  decimals?: number;
  xType?: "time" | "value" | "category";
  xLabel?: string;
  yLabel?: string;
  series: SeriesSpec[];
  bands?: BandSpec[];
  events?: EventMark[];
  alerts?: AlertMark[];
  refLines?: RefLine[];
  categories?: string[];
  /** Mapa de calor: [x, y, valor] */
  heat?: { x: string[]; y: string[]; values: Array<[number, number, number | null]>; min?: number; max?: number; colors?: string[] };
  height?: number;
  /** painel sincronizado: sem barra de zoom e legenda no topo */
  compact?: boolean;
  yMin?: number | "dataMin";
  yMax?: number | "dataMax";
  /** contexto para "Perguntar à IA" */
  context?: Record<string, unknown>;
  warnings?: string[];
  /** fonte: tabela e período */
  source?: string;
}
