/** Indicadores derivados usados nas telas (calculados aqui, nunca nos componentes). */
import type { StatusColor } from "@/lib/colors";

/** Desvio relativo (%) contra um padrão. */
export function relativeDeviation(value: number | null, standard: number | null): number | null {
  if (value == null || standard == null || standard === 0) return null;
  return ((value - standard) / standard) * 100;
}

/** Cor para desvios relativos sem meta cadastrada (ração e água): |Δ| ≤ 5% verde, ≤ 10% amarelo. */
export function statusForRelativeDeviation(dev: number | null): StatusColor {
  if (dev == null) return "cinza";
  const a = Math.abs(dev);
  return a <= 5 ? "verde" : a <= 10 ? "amarelo" : "vermelho";
}

/** Diferença entre dois valores (variação contra o período anterior). */
export function delta(cur: number | null, prev: number | null): number | null {
  if (cur == null || prev == null) return null;
  return cur - prev;
}

export function deltaPct(cur: number | null, prev: number | null): number | null {
  if (cur == null || prev == null || prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}
