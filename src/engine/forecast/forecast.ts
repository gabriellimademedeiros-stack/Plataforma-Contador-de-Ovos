/** Previsão de produção de 8 semanas (Parte 12.7): curva da linhagem + ajuste do lote; aves menos mortalidade padrão. */
import { addDays, ageWeeksDecimal } from "@/lib/dates";
import type { StrainStandards } from "@/engine/standards/strain";

export interface ForecastHouseInput {
  house: string;
  flock: string;
  strainCode: string;
  hatchDate: string;
  plannedCullAgeWeeks: number;
  birds: number;
  adjustment: number;
}

export interface ForecastWeek {
  week: number;
  weekStart: string;
  house: string;
  posture: number;
  postureLow: number;
  postureHigh: number;
  birds: number;
  eggs: number;
  eggsLow: number;
  eggsHigh: number;
  boxes: number;
}

export function forecastHouse(i: ForecastHouseInput, std: StrainStandards, from: string, weeks = 8): ForecastWeek[] {
  const out: ForecastWeek[] = [];
  let birds = i.birds;
  const cullDate = addDays(i.hatchDate, i.plannedCullAgeWeeks * 7);
  for (let k = 1; k <= weeks; k++) {
    const ws = addDays(from, 7 * (k - 1));
    let eggs = 0;
    let low = 0;
    let high = 0;
    let pSum = 0;
    const band = 1.0 + 0.3 * k;
    for (let dd = 0; dd < 7; dd++) {
      const d = addDays(ws, dd);
      if (d >= cullDate) continue; // lote descartado: zera
      const w = ageWeeksDecimal(d, i.hatchDate);
      const p = Math.max(0, (std.at(i.strainCode, "prod.postura", w) ?? 0) + i.adjustment);
      pSum += p;
      eggs += (birds * p) / 100;
      low += (birds * Math.max(0, p - band)) / 100;
      high += (birds * Math.min(100, p + band)) / 100;
      const weekly = w < 26 ? 0.09 : w < 74 ? 0.07 : 0.1;
      birds -= (birds * weekly) / 7 / 100;
    }
    out.push({ week: k, weekStart: ws, house: i.house, posture: pSum / 7, postureLow: pSum / 7 - band, postureHigh: pSum / 7 + band, birds, eggs, eggsLow: low, eggsHigh: high, boxes: eggs / 360 });
  }
  return out;
}

export function farmForecast(rows: ForecastWeek[]) {
  const by = new Map<string, { weekStart: string; week: number; eggs: number; low: number; high: number }>();
  for (const r of rows) {
    const x = by.get(r.weekStart) ?? { weekStart: r.weekStart, week: r.week, eggs: 0, low: 0, high: 0 };
    x.eggs += r.eggs;
    x.low += r.eggsLow;
    x.high += r.eggsHigh;
    by.set(r.weekStart, x);
  }
  return [...by.values()].sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1)).map((x) => ({ ...x, boxes: x.eggs / 360, boxesLow: x.low / 360, boxesHigh: x.high / 360 }));
}
