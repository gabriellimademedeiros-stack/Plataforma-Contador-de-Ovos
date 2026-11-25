/** Mundo simulado completo em memória, compartilhado pelos testes de cenário (sem banco). */
import { generateDataset } from "@/simulator/generate";
import { computeAllMetrics, type MetricsResult } from "@/engine/metrics/pipeline";
import type { Dataset } from "@/engine/types";

export const D_END = "2026-11-24";
let cache: { ds: Dataset; m: MetricsResult } | null = null;

export function world() {
  if (!cache) {
    const ds = generateDataset({ seed: 20261125, dEnd: D_END });
    cache = { ds, m: computeAllMetrics(ds) };
  }
  return cache;
}
