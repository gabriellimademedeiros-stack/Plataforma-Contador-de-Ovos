/**
 * Séries diárias por galpão (Parte 7.8) e classes do contador (Parte 7.9).
 * Gera do alojamento até o fim do período, mantendo o saldo de aves desde o alojamento
 * (dias anteriores a D_start são simulados mas não gravados).
 */
import { ageWeeksDecimal, dateRange, maxDate, minDate } from "@/lib/dates";
import { emptyCounts, type ClassCounts, type DailyEggCount, type DailyRecord, type EggClass, type Flock } from "@/engine/types";
import { BASE_LIGHT_HOURS, DAILY, DEATH_CAUSE_SHARES, DEFECTS } from "./config";
import { curveEggWeight, curveFeed, curvePostura, strainParams, weeklyMortalityStd } from "./curves";
import type { Rng, RngFactory } from "./prng";
import type { DayEffects } from "./scenarios";

export interface HouseDayClimate {
  tmax: number;
  tmean: number;
}

export interface DailyGenInput {
  rngs: RngFactory;
  flock: Flock;
  /** Primeiro e último dia a gravar */
  from: string;
  to: string;
  climate: Map<string, { tmax: number; tmean: number }>;
  effects: (date: string) => DayEffects;
  feedBatchFor: (date: string) => string | null;
  /** Saldo inicial vindo do banco (avanço diário). Se ausente, simula desde o alojamento. */
  resume?: { date: string; birdsStart: number };
}

export interface DailyGenOutput {
  records: DailyRecord[];
  eggs: DailyEggCount[];
  /** Postura simulada (sem arredondamento) por dia, útil para conferência. */
  posture: Map<string, number>;
}

export function heatH1(tmax: number | undefined): number {
  return tmax == null ? 0 : Math.max(0, tmax - DAILY.heatThreshold);
}

function avgH1(climate: Map<string, { tmax: number }>, dates: string[]): number {
  let s = 0;
  let n = 0;
  for (const d of dates) {
    const c = climate.get(d);
    if (c) {
      s += heatH1(c.tmax);
      n++;
    }
  }
  return n ? s / n : 0;
}

export function heatLags(climate: Map<string, { tmax: number }>, date: string, addDaysFn: (d: string, n: number) => string) {
  const d1 = addDaysFn(date, -1);
  const d2 = addDaysFn(date, -2);
  const d3 = addDaysFn(date, -3);
  const H1 = heatH1(climate.get(date)?.tmax);
  const Hlag = avgH1(climate, [d1, d2]);
  const H3 = avgH1(climate, [d3, d2, d1]);
  const H7 = avgH1(climate, [1, 2, 3, 4, 5, 6, 7].map((k) => addDaysFn(date, -k)));
  return { H1, Hlag, H3, H7 };
}

/** Distribui as mortes de base e extras entre causas (Parte 7.8). */
function deathCauses(rng: Rng, base: number, w: number, H1: number, extras: Array<{ n: number; cause: string }>) {
  const out: Record<string, number> = {};
  const calor = Math.min(DEATH_CAUSE_SHARES.calorMax, 0.1 * H1);
  const rest = 1 - calor;
  const prol = w < 30 ? DEATH_CAUSE_SHARES.prolapsoYoung : DEATH_CAUSE_SHARES.prolapso;
  const shares: Array<[string, number]> = [
    ["desconhecida", DEATH_CAUSE_SHARES.desconhecida * rest],
    ["refugo", DEATH_CAUSE_SHARES.refugo * rest],
    ["prolapso", prol * rest],
    ["calor", calor],
  ];
  const used = shares.reduce((a, [, v]) => a + v, 0);
  shares.push(["outras", Math.max(0, 1 - used)]);
  for (let i = 0; i < base; i++) {
    let u = rng.uniform();
    for (const [c, p] of shares) {
      if (u < p) {
        out[c] = (out[c] ?? 0) + 1;
        u = -1;
        break;
      }
      u -= p;
    }
    if (u >= 0) out.outras = (out.outras ?? 0) + 1;
  }
  for (const e of extras) if (e.n > 0) out[e.cause] = (out[e.cause] ?? 0) + e.n;
  return out;
}

/** Taxas de base (%) das classes do contador. */
export function baseDefectRates(w: number, tmean: number, H3: number): Record<Exclude<EggClass, "clean">, number> {
  const old = Math.max(0, w - 26);
  return {
    cracked: DEFECTS.cracked.base + DEFECTS.cracked.ageSlope * old + DEFECTS.cracked.heatCoef * H3,
    broken: DEFECTS.broken.base + DEFECTS.broken.ageSlope * old,
    dirty_feces: DEFECTS.dirtyFeces.base + DEFECTS.dirtyFeces.tempCoef * Math.max(0, tmean - DEFECTS.dirtyFeces.tempRef),
    dirty_blood:
      w >= DEFECTS.dirtyBlood.startWeek
        ? DEFECTS.dirtyBlood.base + DEFECTS.dirtyBlood.amp * Math.exp(-(w - DEFECTS.dirtyBlood.startWeek) / DEFECTS.dirtyBlood.tau)
        : DEFECTS.dirtyBlood.young,
    undetermined: DEFECTS.undetermined,
  };
}

const DEFECT_ORDER: Array<Exclude<EggClass, "clean">> = ["dirty_feces", "dirty_blood", "cracked", "broken", "undetermined"];

/** Classes por pista a partir do total de ovos do dia. */
export function splitEggs(
  rng: Rng,
  eggs: number,
  rates: Record<Exclude<EggClass, "clean">, number>,
  fx: DayEffects,
): { 1: ClassCounts; 2: ClassCounts } {
  const lanes = { 1: emptyCounts(), 2: emptyCounts() };
  const laneEggShare = 0.5 + rng.normal(0, 0.002);
  const lane1Eggs = Math.round(eggs * laneEggShare);
  const laneEggs = { 1: lane1Eggs, 2: eggs - lane1Eggs };
  for (const cls of DEFECT_ORDER) {
    const rate = rates[cls] * (1 + rng.normal(0, DEFECTS.rateSd)) * (fx.classMul[cls] ?? 1);
    const share1 = fx.laneShare1[cls] ?? 0.5 + rng.normal(0, DEFECTS.laneShareSd);
    const lam = (eggs * Math.max(0, rate)) / 100;
    const m1 = fx.laneMul[1][cls] ?? 1;
    const m2 = fx.laneMul[2][cls] ?? 1;
    lanes[1][cls] = rng.poisson(lam * share1 * m1);
    lanes[2][cls] = rng.poisson(lam * (1 - share1) * m2);
  }
  for (const l of [1, 2] as const) {
    let defects = 0;
    for (const cls of DEFECT_ORDER) defects += lanes[l][cls];
    if (defects > laneEggs[l]) {
      // situação extrema: limita os defeitos ao total da pista
      const k = laneEggs[l] / defects;
      defects = 0;
      for (const cls of DEFECT_ORDER) {
        lanes[l][cls] = Math.floor(lanes[l][cls] * k);
        defects += lanes[l][cls];
      }
    }
    lanes[l].clean = laneEggs[l] - defects;
  }
  return lanes;
}

export function generateFlockDaily(inp: DailyGenInput, addDaysFn: (d: string, n: number) => string): DailyGenOutput {
  const { flock, rngs } = inp;
  const s = strainParams(flock.strainCode);
  const H = flock.houseCode;
  const rP = rngs.fresh(`${H}:${flock.code}:postura`);
  const rW = rngs.fresh(`${H}:${flock.code}:peso_ovo`);
  const rM = rngs.fresh(`${H}:${flock.code}:mortes`);
  const rC = rngs.fresh(`${H}:${flock.code}:descartes`);
  const rF = rngs.fresh(`${H}:${flock.code}:racao`);
  const rA = rngs.fresh(`${H}:${flock.code}:agua`);
  const rE = rngs.fresh(`${H}:${flock.code}:contador`);
  const rX = rngs.fresh(`${H}:${flock.code}:extras`);
  const rK = rngs.fresh(`${H}:${flock.code}:causas`);

  const lastDay = flock.endDate ? minDate(flock.endDate, inp.to) : inp.to;
  const records: DailyRecord[] = [];
  const eggs: DailyEggCount[] = [];
  const posture = new Map<string, number>();
  let birds = flock.birdsHoused;
  const simFrom = flock.startDate;

  for (const d of dateRange(simFrom, lastDay)) {
    const w = ageWeeksDecimal(d, flock.hatchDate);
    const fx = inp.effects(d);
    const c = inp.climate.get(d);
    const { H1, Hlag, H3 } = heatLags(inp.climate, d, addDaysFn);
    const tmean = c?.tmean ?? 25;

    if (inp.resume && d === inp.resume.date) birds = inp.resume.birdsStart;

    // Postura
    let post = curvePostura(s, w) + flock.qualityOffset - DAILY.posturaHeatCoef * Hlag - fx.posturaPP + rP.normal(0, DAILY.posturaSd);
    post = Math.min(99, Math.max(0, post));
    const nEggs = Math.min(Math.round((birds * post) / 100), Math.floor(birds * 0.99));
    // Peso do ovo
    const eggW = curveEggWeight(s, w) - DAILY.eggWeightHeatCoef * H3 + rW.normal(0, DAILY.eggWeightSd) + fx.eggWeightAdd;
    // Mortes
    const mBase = weeklyMortalityStd(w) / 7 / 100;
    const baseDeaths = rM.poisson(birds * mBase * (1 + DAILY.mortHeatCoef * H1));
    const extras = fx.extraDeaths.map((x) => ({ n: x.fixed ?? rX.poisson(x.lambda ?? 0), cause: x.cause }));
    const totalDeaths = Math.min(birds, baseDeaths + extras.reduce((a, x) => a + x.n, 0));
    const byCause = deathCauses(rK, baseDeaths, w, H1, extras);
    const culls = rC.poisson(DAILY.cullsLambda);
    // Ração e água
    const feedKg = ((birds * curveFeed(s, w)) / 1000) * (1 - DAILY.feedHeatCoef * H1) * (1 + rF.normal(0, DAILY.feedSd)) * fx.feedMul;
    const waterL =
      ((birds * DAILY.waterPerFeed * curveFeed(s, w)) / 1000) *
      (1 + DAILY.waterHeatCoef * Math.max(0, tmean - DAILY.waterHeatRef)) *
      (1 + rA.normal(0, DAILY.waterSd)) *
      fx.waterMul;
    // Contador
    const rates = baseDefectRates(w, tmean, H3);
    const lanes = splitEggs(rE, nEggs, rates, fx);
    const conf = DEFECTS.confMean + rE.normal(0, DEFECTS.confSd);

    if (d >= maxDate(inp.from, simFrom)) {
      records.push({
        house: H,
        flock: flock.code,
        date: d,
        birdsStart: birds,
        deaths: totalDeaths,
        deathsByCause: byCause,
        culls,
        feedKg: round1(feedKg),
        waterL: round1(waterL),
        eggWeightG: round2(eggW),
        lightHours: BASE_LIGHT_HOURS,
        feedBatch: inp.feedBatchFor(d),
        source: "simulado",
      });
      eggs.push({ house: H, date: d, lanes, meanConf: round3(conf), qualityFlag: 0 });
      posture.set(d, post);
    }
    birds = birds - totalDeaths - culls;
  }
  return { records, eggs, posture };
}

function round1(v: number) {
  return Math.round(v * 10) / 10;
}
function round2(v: number) {
  return Math.round(v * 100) / 100;
}
function round3(v: number) {
  return Math.round(v * 1000) / 1000;
}
