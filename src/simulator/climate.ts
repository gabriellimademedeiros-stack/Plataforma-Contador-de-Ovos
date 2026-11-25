/**
 * Clima (Parte 7.7): externo diário (processo AR), curva horária, interno por galpão, previsão de 7 dias.
 * Os agregados diários são calculados por DIA PRODUTIVO: horas 06–23 do dia D + horas 00–05 do dia D+1.
 */
import { addDays, dateRange, dayOfYear, diffDays, farmInstant, monthOf } from "@/lib/dates";
import type { EnvDay, SensorReading, WeatherForecastDay } from "@/engine/types";
import { CLIMATE, FORECAST_DAYS } from "./config";
import type { RngFactory } from "./prng";

export interface ExternalDay {
  date: string;
  tmax: number;
  tmin: number;
  rh: number;
}

/** Máximas externas forçadas (datas absolutas) por cenário: onda de calor S1, H1, H2. */
export type ForcedTmax = Map<string, number>;

/**
 * Processo diário externo, calculado de `from` até `to` (inclusive), sempre a partir de uma data-âncora fixa
 * para que estender o período não altere os dias já gerados.
 */
export function externalSeries(rngs: RngFactory, anchorStart: string, to: string, forced: ForcedTmax): Map<string, ExternalDay> {
  const rng = rngs.fresh("clima:externo");
  const out = new Map<string, ExternalDay>();
  let e = 0;
  for (const d of dateRange(anchorStart, to)) {
    e = CLIMATE.arCoef * e + rng.normal(0, CLIMATE.arSd);
    const tminNoise = rng.normal(0, CLIMATE.tminSd);
    const rhNoise = rng.normal(0, CLIMATE.rhSd);
    const doy = dayOfYear(d);
    let tmax = CLIMATE.tmaxMean + CLIMATE.tmaxAmp * Math.cos((2 * Math.PI * (doy - CLIMATE.tmaxPeakDoy)) / 365.25) + e;
    const f = forced.get(d);
    let tmin = tmax - CLIMATE.tminOffset + tminNoise;
    if (f != null) {
      tmax = f;
      tmin = f - CLIMATE.tminOffset; // a mínima acompanha (máxima − 11)
    }
    const m = monthOf(d);
    const wet = m >= 2 && m <= 4 ? CLIMATE.rhWetSeasonAdd : 0;
    const rh = Math.min(CLIMATE.rhMax, Math.max(CLIMATE.rhMin, CLIMATE.rhBase - CLIMATE.rhSlope * (tmax - 33) + wet + rhNoise));
    out.set(d, { date: d, tmax, tmin, rh });
  }
  return out;
}

/** Fração do dia na curva horária: mínima às 05h, máxima às 14h. */
export function hourShape(h: number): number {
  if (h >= 5 && h <= 14) return (1 - Math.cos((Math.PI * (h - 5)) / 9)) / 2;
  return (1 + Math.cos((Math.PI * ((((h - 14) % 24) + 24) % 24)) / 15)) / 2;
}

export function externalHourly(day: ExternalDay, h: number): number {
  return day.tmin + (day.tmax - day.tmin) * hourShape(h);
}

/** Horas do dia produtivo D, em ordem: [data civil, hora]. */
export function productiveHours(date: string): Array<[string, number]> {
  const next = addDays(date, 1);
  const out: Array<[string, number]> = [];
  for (let h = 6; h <= 23; h++) out.push([date, h]);
  for (let h = 0; h <= 5; h++) out.push([next, h]);
  return out;
}

export function isNightHour(h: number): boolean {
  return h >= 22 || h <= 5;
}

export interface HouseClimateInput {
  code: string;
  coolingDelta: number;
}

/** Ajuste horário forçado (cenário S9): galpão → instante ISO (data civil + hora) → temperatura interna. */
export type ForcedInternal = Map<string, Map<string, number>>;

export interface ClimateResult {
  external: Map<string, ExternalDay>;
  /** Agregados por dia produtivo: galpão ("EXT" para externo) → data → EnvDay */
  env: EnvDay[];
  /** Temperatura interna horária por galpão (data civil|hora → °C), só para o período horário. */
  sensors: SensorReading[];
  /** Mapa rápido de Tint_max/Tint_mean por galpão/dia produtivo. */
  daily: Map<string, Map<string, { tmax: number; tmean: number; tmin: number; nightMax: number; h32: number }>>;
  forecast: WeatherForecastDay[];
}

function key(date: string, h: number) {
  return `${date}|${h}`;
}

/**
 * Gera clima interno e externo para os dias produtivos [from, to].
 * - `hourlyFrom`: primeiro dia produtivo com leituras horárias gravadas (últimos 60 dias).
 * - `nh3Extra`: incremento de amônia por galpão e dia (cenário S8).
 */
export function generateClimate(opts: {
  rngs: RngFactory;
  anchorStart: string;
  from: string;
  to: string;
  hourlyFrom: string;
  houses: HouseClimateInput[];
  forcedTmax: ForcedTmax;
  forcedInternal: ForcedInternal;
  nh3Extra: (house: string, date: string) => number;
  forecastFrom: string;
  forecastForced?: Record<number, number>;
}): ClimateResult {
  const { rngs, from, to, houses } = opts;
  const lastNeeded = addDays(to, FORECAST_DAYS + 2);
  const external = externalSeries(rngs, opts.anchorStart, lastNeeded, opts.forcedTmax);

  const env: EnvDay[] = [];
  const sensors: SensorReading[] = [];
  const daily: ClimateResult["daily"] = new Map();

  // Externo por dia produtivo
  for (const d of dateRange(from, to)) {
    const hours = productiveHours(d);
    const temps = hours.map(([cd, h]) => externalHourly(external.get(cd)!, h));
    env.push(aggregate(null, d, temps, hours, external.get(d)!.rh, null));
    if (d >= opts.hourlyFrom) {
      hours.forEach(([cd, h], i) => {
        sensors.push({ house: null, ts: farmInstant(cd, h).toISOString(), metric: "amb.temp_externa", value: round2(temps[i]), source: "simulado" });
      });
    }
  }

  // Interno por galpão. Fluxo separado por galpão e por série; percorre desde a âncora para estabilidade.
  for (const house of houses) {
    const rT = rngs.fresh(`${house.code}:tint`);
    const rH = rngs.fresh(`${house.code}:umidade`);
    const rN = rngs.fresh(`${house.code}:nh3`);
    const forced = opts.forcedInternal.get(house.code);
    const hmap = new Map<string, { tmax: number; tmean: number; tmin: number; nightMax: number; h32: number }>();
    daily.set(house.code, hmap);
    for (const d of dateRange(opts.anchorStart, to)) {
      const hours = productiveHours(d);
      const temps: number[] = [];
      const rhs: number[] = [];
      const nh3s: number[] = [];
      const extRh = external.get(d)!.rh;
      for (const [cd, h] of hours) {
        const text = externalHourly(external.get(cd)!, h);
        const cool = house.coolingDelta * clamp((text - CLIMATE.coolingRef) / CLIMATE.coolingRange, 0, CLIMATE.coolingClampMax);
        let t = text - cool + CLIMATE.internalOffset + rT.normal(0, CLIMATE.internalSd);
        const f = forced?.get(key(cd, h));
        if (f != null) t = f;
        temps.push(t);
        rhs.push(Math.min(99, extRh + CLIMATE.rhInternalAdd + rH.normal(0, CLIMATE.rhInternalSd)));
        nh3s.push(CLIMATE.nh3Base + (isNightHour(h) ? CLIMATE.nh3NightAdd : 0) + rN.normal(0, CLIMATE.nh3Sd));
      }
      const hourly = d >= opts.hourlyFrom;
      const extra = hourly ? opts.nh3Extra(house.code, d) : 0;
      const nh3 = hourly ? nh3s.map((v) => Math.max(0, v + extra)) : null;
      const rhMean = rhs.reduce((a, b) => a + b, 0) / rhs.length;
      const agg = aggregate(house.code, d, temps, hours, rhMean, nh3 ? Math.max(...nh3) : null);
      hmap.set(d, { tmax: agg.tempMax, tmean: agg.tempMean, tmin: agg.tempMin, nightMax: agg.nightMax, h32: agg.hoursAbove32 });
      if (d < from) continue;
      env.push(agg);
      if (hourly) {
        hours.forEach(([cd, h], i) => {
          const ts = farmInstant(cd, h).toISOString();
          sensors.push({ house: house.code, ts, metric: "amb.temp_interna", value: round2(temps[i]), source: "simulado" });
          sensors.push({ house: house.code, ts, metric: "amb.umidade", value: round2(rhs[i]), source: "simulado" });
          sensors.push({ house: house.code, ts, metric: "amb.nh3", value: round2(nh3![i]), source: "simulado" });
        });
      }
    }
  }

  const forecast = generateForecast(external, opts.forecastFrom, opts.forecastForced ?? CLIMATE.forecastForced);
  return { external, env, sensors, daily, forecast };
}

/**
 * Previsão de 7 dias: continua o mesmo processo; as máximas de +3 e +4 (relativas ao último dia com dados)
 * são forçadas para 37,0 e 37,5 °C (Parte 7.7), para o aviso preventivo aparecer em qualquer época.
 */
export function generateForecast(
  external: Map<string, ExternalDay>,
  lastDataDay: string,
  forced: Record<number, number>,
): WeatherForecastDay[] {
  const out: WeatherForecastDay[] = [];
  for (let k = 1; k <= FORECAST_DAYS; k++) {
    const d = addDays(lastDataDay, k);
    const day = external.get(d);
    if (!day) continue;
    const tmax = forced[k] ?? day.tmax;
    const tmin = forced[k] != null ? forced[k] - CLIMATE.tminOffset : day.tmin;
    out.push({ date: d, tempMax: round1(tmax), tempMin: round1(tmin), generatedOn: lastDataDay });
  }
  return out;
}

function aggregate(
  house: string | null,
  date: string,
  temps: number[],
  hours: Array<[string, number]>,
  rhMean: number,
  nh3Max: number | null,
): EnvDay {
  let max = -Infinity;
  let min = Infinity;
  let sum = 0;
  let h30 = 0;
  let h32 = 0;
  let dh30 = 0;
  let night = -Infinity;
  temps.forEach((t, i) => {
    max = Math.max(max, t);
    min = Math.min(min, t);
    sum += t;
    if (t > 30) {
      h30++;
      dh30 += t - 30;
    }
    if (t > 32) h32++;
    if (isNightHour(hours[i][1])) night = Math.max(night, t);
  });
  return {
    house,
    date,
    tempMax: round2(max),
    tempMin: round2(min),
    tempMean: round2(sum / temps.length),
    rhMean: round2(rhMean),
    hoursAbove30: h30,
    hoursAbove32: h32,
    degreeHours30: round2(dh30),
    nh3Max: nh3Max == null ? null : round2(nh3Max),
    nightMax: round2(night),
  };
}

export function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}
export function round1(v: number) {
  return Math.round(v * 10) / 10;
}
export function round2(v: number) {
  return Math.round(v * 100) / 100;
}

export { diffDays };
