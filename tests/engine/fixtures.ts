/** Dataset mínimo, montado à mão, para testar fórmulas com valores conhecidos. */
import { DEFAULT_PHASE_BOUNDS } from "@/lib/dates";
import type { ClassCounts, Dataset, DailyEggCount, DailyRecord } from "@/engine/types";
import { COST_PARAMS } from "@/simulator/config";

export function counts(p: Partial<ClassCounts>): ClassCounts {
  return { clean: 0, dirty_feces: 0, dirty_blood: 0, cracked: 0, broken: 0, undetermined: 0, ...p };
}

/**
 * Galpão H1 (lote F1, nascido em 2025-01-01, alojado em 2025-04-30 com 1.000 aves) e galpão H2 (lote F2, 3.000 aves).
 * Dias 2026-01-04 (domingo) a 2026-01-06.
 */
export function tinyDataset(): Dataset {
  const daily: DailyRecord[] = [];
  const egg: DailyEggCount[] = [];
  const mk = (house: string, flock: string, date: string, birds: number, deaths: number, feed: number, water: number, w: number) =>
    daily.push({ house, flock, date, birdsStart: birds, deaths, deathsByCause: { desconhecida: deaths }, culls: 0, feedKg: feed, waterL: water, eggWeightG: w, lightHours: 16, feedBatch: null, source: "simulado" });
  // H1: dia 1 → 800 ovos de 1.000 aves
  mk("H1", "F1", "2026-01-04", 1000, 2, 110, 210, 60);
  egg.push({ house: "H1", date: "2026-01-04", lanes: { 1: counts({ clean: 370, cracked: 20, broken: 4, dirty_feces: 4, dirty_blood: 2 }), 2: counts({ clean: 380, cracked: 10, broken: 2, dirty_feces: 6, undetermined: 2 }) }, meanConf: 0.95, qualityFlag: 0 });
  mk("H1", "F1", "2026-01-05", 998, 1, 109.78, 209.58, 61);
  egg.push({ house: "H1", date: "2026-01-05", lanes: { 1: counts({ clean: 390, cracked: 8 }), 2: counts({ clean: 390, cracked: 10 }) }, meanConf: 0.95, qualityFlag: 0 });
  // H2: 3.000 aves, 2.100 ovos (70%)
  mk("H2", "F2", "2026-01-04", 3000, 3, 300, 600, 64);
  egg.push({ house: "H2", date: "2026-01-04", lanes: { 1: counts({ clean: 1000, cracked: 50 }), 2: counts({ clean: 1040, cracked: 10 }) }, meanConf: 0.95, qualityFlag: 0 });
  mk("H2", "F2", "2026-01-05", 2997, 0, 299.7, 599.4, 64);
  egg.push({ house: "H2", date: "2026-01-05", lanes: { 1: counts({ clean: 1049 }), 2: counts({ clean: 1049 }) }, meanConf: 0.95, qualityFlag: 0 });

  return {
    seed: 1,
    dStart: "2026-01-04",
    dEnd: "2026-01-05",
    farm: { id: "f", tenantId: "t", name: "Teste", city: "x", timezone: "America/Fortaleza", cutoffHour: 6, weekStartDow: 0, phaseBounds: DEFAULT_PHASE_BOUNDS },
    houses: [
      { id: "h1", code: "H1", name: "H1", capacity: 1100, coolingDelta: 6, color: "#000", sortOrder: 1, lanes: 2 },
      { id: "h2", code: "H2", name: "H2", capacity: 3100, coolingDelta: 6, color: "#000", sortOrder: 2, lanes: 2 },
    ],
    strains: [{ id: "s", code: "ALFA", name: "Alfa", shellColor: "branco" }],
    flocks: [
      { id: "f1", code: "F1", strainCode: "ALFA", houseCode: "H1", hatchDate: "2025-01-01", birdsHoused: 1000, chickCostBrl: 28, plannedCullAgeWeeks: 90, status: "ativo", qualityOffset: 0, startDate: "2026-01-04", endDate: null },
      { id: "f2", code: "F2", strainCode: "ALFA", houseCode: "H2", hatchDate: "2025-01-01", birdsHoused: 3000, chickCostBrl: 28, plannedCullAgeWeeks: 90, status: "ativo", qualityOffset: 0, startDate: "2026-01-04", endDate: null },
    ],
    daily,
    eggDaily: egg,
    eggHourly: [],
    env: [
      { house: "H1", date: "2026-01-04", tempMax: 33.2, tempMin: 24, tempMean: 28, rhMean: 60, hoursAbove30: 5, hoursAbove32: 2, degreeHours30: 7.5, nh3Max: 12, nightMax: 27 },
      { house: null, date: "2026-01-04", tempMax: 36, tempMin: 25, tempMean: 30, rhMean: 50, hoursAbove30: 8, hoursAbove32: 6, degreeHours30: 20, nh3Max: null, nightMax: 28 },
    ],
    sensors: [],
    forecast: [],
    feedBatches: [],
    bodyWeights: [{ house: "H1", flock: "F1", date: "2026-01-04", n: 100, meanG: 1600, cvPct: 8, uniformityPct: 86 }],
    lab: [{ id: "l", house: "H1", flock: "F1", date: "2026-01-04", n: 30, strength: 3.9, thickness: 0.38, gravity: 1.085, haugh: 85, eggWeight: 60, yolkColor: 7 }],
    shelfLife: [],
    prices: [{ weekStart: "2026-01-04", ovo_comercial_dz: 5.4, ovo_trincado_dz: 3.0, ovo_sujo_dz: 4.0, racao_kg: 2.0, ave_descarte_un: 6 }],
    costParams: Object.fromEntries(COST_PARAMS.map((c) => [c.key, c.value])),
    events: [],
  };
}
