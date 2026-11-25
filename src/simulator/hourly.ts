/** Dados horários: contador por hora (últimos 30 dias) e água por hora (últimos 60 dias). */
import { farmInstant } from "@/lib/dates";
import { EGG_CLASSES, emptyCounts, type DailyEggCount, type HourlyEggCount, type SensorReading } from "@/engine/types";
import { LAYING_HOUR_WEIGHTS, WATER_HOUR_WEIGHTS } from "./config";
import { productiveHours } from "./climate";
import type { Rng } from "./prng";

/** Distribui um inteiro por pesos (maiores restos), garantindo que a soma bata exatamente. */
export function distributeInteger(total: number, weights: number[]): number[] {
  const sw = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (total * w) / sw);
  const base = raw.map(Math.floor);
  let rem = total - base.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; rem > 0; k = (k + 1) % order.length, rem--) base[order[k][1]]++;
  return base;
}

const LAY_HOURS = Object.keys(LAYING_HOUR_WEIGHTS).map(Number);

export function hourlyEggs(day: DailyEggCount): HourlyEggCount[] {
  const out: HourlyEggCount[] = [];
  const weights = LAY_HOURS.map((h) => LAYING_HOUR_WEIGHTS[h]);
  for (const lane of [1, 2] as const) {
    const perHour = LAY_HOURS.map(() => emptyCounts());
    for (const cls of EGG_CLASSES) {
      const parts = distributeInteger(day.lanes[lane][cls], weights);
      parts.forEach((q, i) => (perHour[i][cls] = q));
    }
    LAY_HOURS.forEach((h, i) => {
      out.push({
        house: day.house,
        date: day.date,
        windowStart: farmInstant(day.date, h).toISOString(),
        windowMinutes: 60,
        lane,
        counts: perHour[i],
        meanConf: day.meanConf,
        source: "simulado",
      });
    });
  }
  return out;
}

/** Água por hora no dia produtivo; soma igual ao total diário. */
export function hourlyWater(house: string, date: string, waterL: number, rng: Rng): SensorReading[] {
  const hours = productiveHours(date);
  const w = hours.map(([, h]) => WATER_HOUR_WEIGHTS[h] * (1 + rng.normal(0, 0.03)));
  const sw = w.reduce((a, b) => a + b, 0);
  return hours.map(([cd, h], i) => ({
    house,
    ts: farmInstant(cd, h).toISOString(),
    metric: "nut.agua_litros" as const,
    value: Math.round(((waterL * w[i]) / sw) * 100) / 100,
    source: "simulado" as const,
  }));
}
