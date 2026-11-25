/**
 * Modelo serializável de relatório (Parte 15): o mesmo objeto alimenta a tela, a impressão, o modo reunião
 * e o retrato gravado em report_runs. Números já formatados em pt-BR; gráficos como ChartSpec.
 */
import type { ChartSpec } from "@/components/charts/types";

export type Tone = "good" | "bad" | "warn" | "muted" | null;

export interface RCell {
  v: string;
  tone?: Tone;
  bold?: boolean;
}

export type RRow = RCell[] | { group: string };

export type RBlock =
  | { type: "kpis"; items: Array<{ label: string; value: string; lines?: Array<{ text: string; tone?: Tone }> }> }
  | { type: "text"; title?: string; lines: string[]; style?: "bullets" | "plain" | "callout" | "numbered" }
  | { type: "table"; title?: string; columns: string[]; align?: Array<"l" | "r" | "c">; rows: RRow[]; note?: string; empty?: string }
  | { type: "chart"; spec: ChartSpec; height?: number }
  | { type: "grid"; cols: 2 | 3; blocks: RBlock[] }
  | { type: "items"; title?: string; items: Array<{ head: string; tag?: string; tone?: Tone; lines: string[] }>; empty?: string };

export interface RPage {
  n: number;
  title: string;
  subtitle?: string;
  badges?: string[];
  blocks: RBlock[];
}

export interface ReportModel {
  kind: "semanal" | "comparativo";
  title: string;
  weekStart: string;
  weekLabel: string;
  farmName: string;
  refDate: string;
  generatedAt: string;
  /** escopo usado (perfil); null = granja inteira */
  scopeNote: string | null;
  pages: RPage[];
}
