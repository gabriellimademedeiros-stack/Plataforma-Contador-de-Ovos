/** Pesagem semanal, laboratório de casca e shelf life (Partes 7.8 e 7.10). */
import { addDays, ageWeeksDecimal, dateRange, dayOfWeek, diffDays } from "@/lib/dates";
import { uuidFromName } from "@/lib/ids";
import type { BodyWeightSample, DailyRecord, Flock, LabSample, ShelfLifeTest } from "@/engine/types";
import { BODY_WEIGHT, HOUSES, LAB, SHELF_LIFE } from "./config";
import { curveBodyWeight, strainParams } from "./curves";
import type { RngFactory } from "./prng";
import type { DayEffects } from "./scenarios";

type H7Fn = (house: string, date: string) => number;

export function generateBodyWeights(rngs: RngFactory, flocks: Flock[], from: string, to: string, H7: H7Fn): BodyWeightSample[] {
  const out: BodyWeightSample[] = [];
  for (const f of flocks) {
    const r = rngs.fresh(`${f.houseCode}:${f.code}:pesagem`);
    const end = f.endDate && f.endDate < to ? f.endDate : to;
    for (const d of dateRange(f.startDate, end)) {
      if (dayOfWeek(d) !== BODY_WEIGHT.dow) continue;
      const w = ageWeeksDecimal(d, f.hatchDate);
      const s = strainParams(f.strainCode);
      const mean = curveBodyWeight(s, w) * (1 - BODY_WEIGHT.heatCoef * H7(f.houseCode, d)) + r.normal(0, BODY_WEIGHT.sd);
      const cv = BODY_WEIGHT.cvMean + r.normal(0, BODY_WEIGHT.cvSd);
      const uni = (w < 26 ? BODY_WEIGHT.uniformityYoung : BODY_WEIGHT.uniformity) + r.normal(0, BODY_WEIGHT.uniformitySd);
      if (d < from) continue;
      out.push({ house: f.houseCode, flock: f.code, date: d, n: BODY_WEIGHT.n, meanG: Math.round(mean), cvPct: round1(cv), uniformityPct: round1(Math.min(100, uni)) });
    }
  }
  return out;
}

export function generateLab(
  rngs: RngFactory,
  flocks: Flock[],
  from: string,
  to: string,
  H7: H7Fn,
  effects: (house: string, flock: string, date: string) => DayEffects,
  dailyByHouse: Map<string, Map<string, DailyRecord>>,
): LabSample[] {
  const out: LabSample[] = [];
  for (const f of flocks) {
    const r = rngs.fresh(`${f.houseCode}:${f.code}:laboratorio`);
    const end = f.endDate && f.endDate < to ? f.endDate : to;
    for (const d of dateRange(f.startDate, end)) {
      if (dayOfWeek(d) !== LAB.dow) continue;
      const w = ageWeeksDecimal(d, f.hatchDate);
      const old = Math.max(0, w - 26);
      const h7 = H7(f.houseCode, d);
      const fx = effects(f.houseCode, f.code, d).lab;
      const strength = LAB.strength.base - LAB.strength.ageSlope * old - LAB.strength.heatCoef * h7 + r.normal(0, LAB.strength.sd) + fx.strength;
      const thickness = LAB.thickness.base - LAB.thickness.ageSlope * old + r.normal(0, LAB.thickness.sd);
      const gravity = LAB.gravity.base - LAB.gravity.ageSlope * old + r.normal(0, LAB.gravity.sd) + fx.gravity;
      const haugh = LAB.haugh.base - LAB.haugh.ageSlope * old - LAB.haugh.heatCoef * h7 + r.normal(0, LAB.haugh.sd) + fx.haugh;
      const yolk = LAB.yolk.base + r.normal(0, LAB.yolk.sd);
      if (d < from) continue;
      const egg = dailyByHouse.get(f.houseCode)?.get(d)?.eggWeightG ?? null;
      out.push({
        id: uuidFromName(`lab:${f.houseCode}:${d}`),
        house: f.houseCode,
        flock: f.code,
        date: d,
        n: LAB.n,
        strength: round2(strength),
        thickness: round3(thickness),
        gravity: round4(gravity),
        haugh: round1(haugh),
        eggWeight: egg,
        yolkColor: round1(yolk),
        notes: null,
      });
    }
  }
  return out;
}

/**
 * Shelf life: um teste a cada 4 semanas em galpão alternado (P001 … P008), a 25 °C e 65% UR,
 * medições nos dias 0, 7, 14, 21 e 28. Teste extra em D−18 no P005 (onda de calor) com queda de 1,25/dia.
 */
export function generateShelfLife(
  rngs: RngFactory,
  flocks: Flock[],
  lab: LabSample[],
  dStart: string,
  dEnd: string,
  to: string,
): ShelfLifeTest[] {
  const out: ShelfLifeTest[] = [];
  const labByHouse = new Map<string, LabSample[]>();
  for (const s of lab) {
    let a = labByHouse.get(s.house);
    if (!a) labByHouse.set(s.house, (a = []));
    a.push(s);
  }
  const lastLab = (house: string, date: string) => {
    const arr = labByHouse.get(house) ?? [];
    let best: LabSample | undefined;
    for (const s of arr) if (s.date <= date && (!best || s.date > best.date)) best = s;
    return best;
  };
  const activeFlock = (house: string, date: string) =>
    flocks.find((f) => f.houseCode === house && f.startDate <= date && (f.endDate == null || date <= f.endDate));

  // âncora: primeira quinta-feira a partir de D_start
  let first = dStart;
  while (dayOfWeek(first) !== LAB.dow) first = addDays(first, 1);
  let k = 0;
  for (let start = first; start <= to; start = addDays(start, SHELF_LIFE.everyWeeks * 7), k++) {
    let house: string | null = null;
    for (let j = 0; j < HOUSES.length; j++) {
      const cand = HOUSES[(k + j) % HOUSES.length].code;
      if (activeFlock(cand, start) && lastLab(cand, start)) {
        house = cand;
        break;
      }
    }
    if (!house) continue;
    out.push(makeTest(rngs, house, activeFlock(house, start)!.code, start, lastLab(house, start)!.haugh ?? 85, SHELF_LIFE.haughSlope, to, false));
  }
  const extraStart = addDays(dEnd, SHELF_LIFE.extraStartOffset);
  const f5 = activeFlock(SHELF_LIFE.extraHouse, extraStart);
  const l5 = lastLab(SHELF_LIFE.extraHouse, extraStart);
  if (f5 && l5 && extraStart <= to)
    out.push(makeTest(rngs, SHELF_LIFE.extraHouse, f5.code, extraStart, l5.haugh ?? 85, SHELF_LIFE.extraSlope, to, true));
  return out.sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
}

function makeTest(rngs: RngFactory, house: string, flock: string, start: string, haugh0: number, slope: number, to: string, extra: boolean): ShelfLifeTest {
  const r = rngs.fresh(`shelf:${house}:${start}`);
  const measurements = SHELF_LIFE.schedule.map((day) => {
    const haugh = haugh0 - slope * day + SHELF_LIFE.haughQuad * day * day + (day === 0 ? 0 : r.normal(0, SHELF_LIFE.haughSd));
    const loss = Math.max(0, SHELF_LIFE.lossSlope * day + r.normal(0, SHELF_LIFE.lossSd));
    return { day, n: SHELF_LIFE.n, haugh: round1(haugh), weightLossPct: round2(day === 0 ? 0 : loss), airCellMm: round2(SHELF_LIFE.airCellBase + SHELF_LIFE.airCellSlope * day) };
  });
  return {
    id: uuidFromName(`shelf:${house}:${start}`),
    house,
    flock,
    startDate: start,
    storageTemp: SHELF_LIFE.storageTemp,
    storageRh: SHELF_LIFE.storageRh,
    schedule: [...SHELF_LIFE.schedule],
    measurements: measurements.filter((m) => diffDays(start, to) >= m.day),
    extra,
  };
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
function round4(v: number) {
  return Math.round(v * 10000) / 10000;
}
