/** Mundo simulado completo em memória, compartilhado pelos testes de cenário (sem banco). */
import { generateDataset } from "@/simulator/generate";
import { calibrateFinance } from "@/simulator/calibrate";
import { computeAllMetrics, type MetricsResult } from "@/engine/metrics/pipeline";
import type { Dataset } from "@/engine/types";

export const D_END = "2026-11-24";
let cache: { ds: Dataset; m: MetricsResult } | null = null;

export function world() {
  if (!cache) {
    const calib = calibrateFinance(20261125, D_END);
    const ds = generateDataset({ seed: 20261125, dEnd: D_END, calibEgg: calib.calibEgg, qualityOffset: { L107: calib.l107 } });
    cache = { ds, m: computeAllMetrics(ds) };
  }
  return cache;
}
