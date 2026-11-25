/**
 * Orquestrador do simulador: gera o Dataset completo em memória (Partes 7.1 a 7.13).
 * Mesma semente + mesma D_end = mesmos dados, bit a bit.
 * `to` permite estender além de D_end (avanço diário) mantendo a âncora dos cenários em D_end.
 */
import { addDays, dateRange, minDate } from "@/lib/dates";
import { FARM_ID, TENANT_ID, houseIdFor, strainIdFor } from "@/lib/ids";
import { HOUSE_COLORS } from "@/lib/colors";
import { DEFAULT_PHASE_BOUNDS } from "@/lib/dates";
import type { Dataset, DailyRecord, EventRecord, Flock, HourlyEggCount, SensorReading } from "@/engine/types";
import { COST_PARAMS, FARM, HOURLY_COUNTER_DAYS, HOURLY_SENSOR_DAYS, HOUSES, STRAINS } from "./config";
import { generateClimate, type ForcedInternal, type ForcedTmax } from "./climate";
import { generateFlockDaily, heatLags } from "./daily";
import { buildSeededEvents } from "./events";
import { buildFlocks } from "./flocks";
import { hourlyEggs, hourlyWater } from "./hourly";
import { generateBodyWeights, generateLab, generateShelfLife } from "./lab";
import { batchFor, generateFeedBatches, generatePrices } from "./prices";
import { RngFactory } from "./prng";
import { HEAT_WAVES, S9_FORCED, effectsFor, scenarioDates, type ScenarioContext } from "./scenarios";

export interface GenerateOptions {
  seed: number;
  dEnd: string;
  dStart?: string;
  /** Último dia produtivo a gerar (padrão: D_end). */
  to?: string;
  /** Primeiro dia a incluir nas saídas (padrão: D_start). Usado pelo avanço diário. */
  emitFrom?: string;
  qualityOffset?: Record<string, number>;
  calibEgg?: number[];
  intensity?: Record<string, number>;
  /** Pular dados horários (mais rápido para testes). */
  skipHourly?: boolean;
}

export function forcedTmaxFor(dEnd: string): ForcedTmax {
  const m: ForcedTmax = new Map();
  for (const hw of Object.values(HEAT_WAVES)) {
    hw.tmax.forEach((t, i) => m.set(addDays(dEnd, hw.start + i), t));
  }
  return m;
}

export function forcedInternalFor(dEnd: string): ForcedInternal {
  const m: ForcedInternal = new Map();
  const inner = new Map<string, number>();
  const cd = addDays(dEnd, S9_FORCED.calendarOffset);
  S9_FORCED.hours.forEach((h, i) => inner.set(`${cd}|${h}`, S9_FORCED.temps[i]));
  m.set(S9_FORCED.house, inner);
  return m;
}

export function generateDataset(opts: GenerateOptions): Dataset {
  const rngs = new RngFactory(opts.seed);
  const dEnd = opts.dEnd;
  const dStart = opts.dStart ?? addDays(dEnd, -1095);
  const to = opts.to ?? dEnd;
  const emitFrom = opts.emitFrom ?? dStart;

  const flocks = buildFlocks(rngs, dEnd, dStart, { qualityOffset: opts.qualityOffset });
  // após D_end, lotes que passarem do descarte planejado continuam (a beta não aloja lotes novos)
  const flocksByHouse = new Map<string, Flock[]>();
  for (const f of flocks) {
    let a = flocksByHouse.get(f.houseCode);
    if (!a) flocksByHouse.set(f.houseCode, (a = []));
    a.push(f);
  }
  for (const a of flocksByHouse.values()) a.sort((x, y) => (x.startDate < y.startDate ? -1 : 1));
  const activeHousesAt = (date: string) =>
    HOUSES.map((h) => h.code).filter((code) =>
      (flocksByHouse.get(code) ?? []).some((f) => f.startDate <= date && (f.endDate == null || date <= f.endDate)),
    );

  const ctx: ScenarioContext = { dEnd, flocksByHouse, intensity: opts.intensity };
  const dates = scenarioDates(ctx);
  const fxCache = new Map<string, ReturnType<typeof effectsFor>>();
  const fx = (house: string, flock: string, date: string) => {
    const k = `${house}|${flock}|${date}`;
    let v = fxCache.get(k);
    if (!v) fxCache.set(k, (v = effectsFor(house, flock, date, ctx, dates)));
    return v;
  };
  const flockOn = (house: string, date: string) =>
    (flocksByHouse.get(house) ?? []).find((f) => f.startDate <= date && (f.endDate == null || date <= f.endDate));

  // Clima: âncora fixa antes do lote mais antigo, para estabilidade ao estender o período
  const earliest = flocks.reduce((m, f) => (f.startDate < m ? f.startDate : m), dStart);
  const anchorStart = addDays(earliest, -10);
  const hourlyFrom = addDays(to, -(HOURLY_SENSOR_DAYS - 1));
  const climate = generateClimate({
    rngs,
    anchorStart,
    from: emitFrom,
    to,
    hourlyFrom: opts.skipHourly ? addDays(to, 1) : hourlyFrom,
    houses: HOUSES.map((h) => ({ code: h.code, coolingDelta: h.coolingDelta })),
    forcedTmax: forcedTmaxFor(dEnd),
    forcedInternal: forcedInternalFor(dEnd),
    nh3Extra: (house, date) => {
      const f = flockOn(house, date);
      return f ? fx(house, f.code, date).nh3Add : 0;
    },
    forecastFrom: to,
  });

  // Preços e cargas de ração
  const prices = generatePrices(rngs, dStart, dEnd, to, { calibEgg: opts.calibEgg });
  const priceByWeek = new Map(prices.map((p) => [p.weekStart, p]));
  const feedPrice = (date: string) => {
    let best = prices[0];
    for (const p of prices) if (p.weekStart <= date) best = p;
    return best.racao_kg;
  };
  const feedBatches = generateFeedBatches(dStart, dEnd, to, feedPrice);

  // Séries diárias
  const daily: DailyRecord[] = [];
  const eggDaily: Dataset["eggDaily"] = [];
  for (const f of flocks) {
    if (f.endDate && f.endDate < emitFrom) continue;
    if (f.startDate > to) continue;
    const climateMap = climate.daily.get(f.houseCode)!;
    const out = generateFlockDaily(
      {
        rngs,
        flock: f,
        from: emitFrom,
        to,
        climate: climateMap,
        effects: (date) => fx(f.houseCode, f.code, date),
        feedBatchFor: (date) => batchFor(feedBatches, f.houseCode, date)?.code ?? null,
      },
      addDays,
    );
    daily.push(...out.records);
    eggDaily.push(...out.eggs);
  }
  daily.sort(byHouseDate);
  eggDaily.sort(byHouseDate);

  const H7 = (house: string, date: string) => heatLags(climate.daily.get(house)!, date, addDays).H7;
  const dailyByHouse = new Map<string, Map<string, DailyRecord>>();
  for (const r of daily) {
    let m = dailyByHouse.get(r.house);
    if (!m) dailyByHouse.set(r.house, (m = new Map()));
    m.set(r.date, r);
  }

  // Dados horários
  const eggHourly: HourlyEggCount[] = [];
  const sensors: SensorReading[] = [...climate.sensors];
  if (!opts.skipHourly) {
    const counterFrom = addDays(to, -(HOURLY_COUNTER_DAYS - 1));
    for (const e of eggDaily) if (e.date >= counterFrom && e.date >= emitFrom) eggHourly.push(...hourlyEggs(e));
    for (const h of HOUSES) {
      const r = rngs.fresh(`${h.code}:agua_horaria`);
      for (const d of dateRange(addDays(hourlyFrom, 0), to)) {
        const rec = dailyByHouse.get(h.code)?.get(d);
        // consome o fluxo de forma estável mesmo em dias vazios
        if (!rec || rec.waterL == null) {
          for (let i = 0; i < 24; i++) r.normal();
          continue;
        }
        const rows = hourlyWater(h.code, d, rec.waterL, r);
        if (d >= emitFrom) sensors.push(...rows);
      }
    }
  }

  // Pesagem, laboratório e shelf life (gerados desde o alojamento para estabilidade dos fluxos)
  const bodyWeights = generateBodyWeights(rngs, flocks, emitFrom, to, H7);
  const lab = generateLab(rngs, flocks, emitFrom, to, H7, fx, dailyByHouse);
  const shelfLife = generateShelfLife(rngs, flocks, lab, dStart, dEnd, to).filter(
    (t) => t.startDate >= emitFrom || t.measurements.some((m) => addDays(t.startDate, m.day) >= emitFrom),
  );

  // Eventos semeados
  const events: EventRecord[] = buildSeededEvents({ dEnd, to, dates, flocks, activeHousesAt }).filter((e) => e.startDate <= to);

  return {
    seed: opts.seed,
    dStart,
    dEnd: to,
    farm: {
      id: FARM_ID,
      tenantId: TENANT_ID,
      name: FARM.name,
      city: FARM.city,
      timezone: FARM.timezone,
      cutoffHour: FARM.cutoffHour,
      weekStartDow: FARM.weekStartDow,
      phaseBounds: DEFAULT_PHASE_BOUNDS,
    },
    houses: HOUSES.map((h, i) => ({
      id: houseIdFor(h.code),
      code: h.code,
      name: `Aviário ${h.code.slice(1)}`,
      capacity: h.capacity,
      coolingDelta: h.coolingDelta,
      color: HOUSE_COLORS[h.code],
      sortOrder: i + 1,
      lanes: 2,
    })),
    strains: STRAINS.map((s) => ({ id: strainIdFor(s.code), code: s.code, name: s.name, shellColor: s.shellColor })),
    flocks,
    daily,
    eggDaily,
    eggHourly,
    env: climate.env,
    sensors,
    forecast: climate.forecast,
    feedBatches: feedBatches.filter((b) => b.deliveredOn <= to),
    bodyWeights,
    lab,
    shelfLife,
    prices: prices.filter((p) => p.weekStart <= to && priceByWeek.has(p.weekStart)),
    costParams: Object.fromEntries(COST_PARAMS.map((c) => [c.key, c.value])),
    events,
  };
}

function byHouseDate(a: { house: string; date: string }, b: { house: string; date: string }) {
  return a.house < b.house ? -1 : a.house > b.house ? 1 : a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
}

export { minDate };
