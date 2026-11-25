/** Lotes atuais e anteriores (Partes 7.5 e 7.6). */
import { addDays } from "@/lib/dates";
import { flockIdFor } from "@/lib/ids";
import type { Flock } from "@/engine/types";
import {
  CHICK_COST_BRL,
  EMPTY_PERIOD_DAYS,
  HOUSES,
  PLACEMENT_AGE_DAYS,
  PLANNED_CULL_WEEKS,
  PREVIOUS_QUALITY_SD,
} from "./config";
import type { RngFactory } from "./prng";

export interface FlockOverrides {
  /** Ajuste de qualidade de lotes específicos (calibração do L107). */
  qualityOffset?: Record<string, number>;
}

/**
 * Lotes de cada galpão: o atual (L101…L108) e os anteriores, de trás para frente, até cobrir D_start.
 * O lote anterior foi descartado 21 dias antes do alojamento do seguinte, com 90 semanas; alojado aos 17 semanas.
 */
export function buildFlocks(rngs: RngFactory, dEnd: string, dStart: string, ov: FlockOverrides = {}): Flock[] {
  const current: Flock[] = [];
  const previous: Array<Omit<Flock, "code" | "id">> = [];
  for (const h of HOUSES) {
    const hatch = addDays(dEnd, -(h.ageWeeksAtEnd * 7 + 3));
    const start = addDays(hatch, PLACEMENT_AGE_DAYS);
    current.push({
      id: flockIdFor(h.currentFlock),
      code: h.currentFlock,
      strainCode: h.strain,
      houseCode: h.code,
      hatchDate: hatch,
      birdsHoused: h.birdsHoused,
      chickCostBrl: CHICK_COST_BRL,
      plannedCullAgeWeeks: PLANNED_CULL_WEEKS,
      status: "ativo",
      qualityOffset: ov.qualityOffset?.[h.currentFlock] ?? h.qualityOffset,
      startDate: start,
      endDate: null,
    });
    let nextStart = start;
    let i = 0;
    while (nextStart > dStart) {
      const strain = h.previousStrains[i] ?? h.previousStrains[h.previousStrains.length - 1];
      const cull = addDays(nextStart, -EMPTY_PERIOD_DAYS);
      const pHatch = addDays(cull, -PLANNED_CULL_WEEKS * 7);
      const pStart = addDays(pHatch, PLACEMENT_AGE_DAYS);
      previous.push({
        strainCode: strain,
        houseCode: h.code,
        hatchDate: pHatch,
        birdsHoused: Math.round((h.capacity * 0.95) / 1000) * 1000,
        chickCostBrl: CHICK_COST_BRL,
        plannedCullAgeWeeks: PLANNED_CULL_WEEKS,
        status: "encerrado",
        qualityOffset: 0,
        startDate: pStart,
        endDate: cull,
      });
      nextStart = pStart;
      i++;
    }
  }
  // Códigos L001, L002… em ordem cronológica de alojamento (empate: ordem física do galpão)
  previous.sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : a.houseCode < b.houseCode ? -1 : 1));
  const prevFlocks: Flock[] = previous.map((p, k) => {
    const code = `L${String(k + 1).padStart(3, "0")}`;
    const q = rngs.fresh(`lote:${code}:qualidade`).normal(0, PREVIOUS_QUALITY_SD);
    return { ...p, id: flockIdFor(code), code, qualityOffset: ov.qualityOffset?.[code] ?? round2(q) };
  });
  return [...prevFlocks, ...current];
}

function round2(v: number) {
  return Math.round(v * 100) / 100;
}
