/**
 * Estruturas em memória usadas pelo simulador, pelo motor e pelos repositórios.
 * Datas de negócio são strings "AAAA-MM-DD"; instantes são strings ISO 8601 (UTC).
 * Galpões e lotes são referenciados pelo código (P001, L101); cada objeto também tem o id do banco.
 */
import type { PhaseBounds } from "@/lib/dates";

export type EggClass = "clean" | "dirty_feces" | "dirty_blood" | "cracked" | "broken" | "undetermined";
export const EGG_CLASSES: EggClass[] = ["clean", "dirty_feces", "dirty_blood", "cracked", "broken", "undetermined"];
export const DEFECT_CLASSES: EggClass[] = ["dirty_feces", "dirty_blood", "cracked", "broken", "undetermined"];

export type ClassCounts = Record<EggClass, number>;

export function emptyCounts(): ClassCounts {
  return { clean: 0, dirty_feces: 0, dirty_blood: 0, cracked: 0, broken: 0, undetermined: 0 };
}

export function totalCounts(c: ClassCounts): number {
  return c.clean + c.dirty_feces + c.dirty_blood + c.cracked + c.broken + c.undetermined;
}

export interface FarmInfo {
  id: string;
  tenantId: string;
  name: string;
  city: string;
  timezone: string;
  cutoffHour: number;
  weekStartDow: number;
  phaseBounds: PhaseBounds;
}

export interface House {
  id: string;
  code: string;
  name: string;
  capacity: number;
  coolingDelta: number;
  color: string;
  sortOrder: number;
  lanes: number;
}

export interface StrainInfo {
  id: string;
  code: string;
  name: string;
  shellColor: string;
}

export interface Flock {
  id: string;
  code: string;
  strainCode: string;
  houseCode: string;
  hatchDate: string;
  birdsHoused: number;
  chickCostBrl: number;
  plannedCullAgeWeeks: number;
  status: "ativo" | "encerrado";
  /** Só simulador. */
  qualityOffset: number;
  startDate: string;
  /** Último dia no galpão (descarte). null = ativo. */
  endDate: string | null;
}

export interface DailyRecord {
  house: string;
  flock: string;
  date: string;
  birdsStart: number;
  deaths: number;
  deathsByCause: Record<string, number>;
  culls: number;
  feedKg: number | null;
  waterL: number | null;
  eggWeightG: number | null;
  lightHours: number | null;
  feedBatch: string | null;
  source: "simulado" | "ao_vivo" | "campo";
}

/** Contagem diária do contador por pista (janela de 1440 min). */
export interface DailyEggCount {
  house: string;
  date: string;
  lanes: { 1: ClassCounts; 2: ClassCounts };
  meanConf: number;
  /** 0 = ok; 1 = suspeito; 2 = sem dado */
  qualityFlag: number;
}

export interface HourlyEggCount {
  house: string;
  date: string;
  /** instante ISO do início da janela */
  windowStart: string;
  windowMinutes: 60 | 1;
  lane: 1 | 2;
  counts: ClassCounts;
  meanConf: number;
  source: "simulado" | "ao_vivo";
  messageId?: string | null;
}

export interface EnvDay {
  /** null = externo */
  house: string | null;
  date: string;
  tempMax: number;
  tempMin: number;
  tempMean: number;
  rhMean: number;
  hoursAbove30: number;
  hoursAbove32: number;
  degreeHours30: number;
  nh3Max: number | null;
  nightMax: number;
}

export interface SensorReading {
  house: string | null;
  ts: string;
  metric: "amb.temp_interna" | "amb.temp_externa" | "amb.umidade" | "amb.nh3" | "nut.agua_litros";
  value: number;
  source: "simulado" | "ao_vivo";
}

export interface WeatherForecastDay {
  date: string;
  tempMax: number;
  tempMin: number;
  generatedOn: string;
}

export interface FeedBatch {
  id: string;
  code: string;
  deliveredOn: string;
  group: string;
  houses: string[];
  pricePerKg: number;
  calciumSpec: number;
  supplier: string;
  formulation: string;
}

export interface BodyWeightSample {
  house: string;
  flock: string;
  date: string;
  n: number;
  meanG: number;
  cvPct: number;
  uniformityPct: number;
}

export interface LabSample {
  id: string;
  house: string;
  flock: string;
  date: string;
  n: number;
  strength: number | null;
  thickness: number | null;
  gravity: number | null;
  haugh: number | null;
  eggWeight: number | null;
  yolkColor: number | null;
  notes?: string | null;
}

export interface ShelfLifeMeasurement {
  day: number;
  n: number;
  haugh: number;
  weightLossPct: number;
  airCellMm: number;
}

export interface ShelfLifeTest {
  id: string;
  house: string;
  flock: string;
  startDate: string;
  storageTemp: number;
  storageRh: number;
  schedule: number[];
  measurements: ShelfLifeMeasurement[];
  extra?: boolean;
}

export type PriceItem = "ovo_comercial_dz" | "ovo_trincado_dz" | "ovo_sujo_dz" | "racao_kg" | "ave_descarte_un";

export interface WeeklyPrices {
  weekStart: string;
  ovo_comercial_dz: number;
  ovo_trincado_dz: number;
  ovo_sujo_dz: number;
  racao_kg: number;
  ave_descarte_un: number;
}

export type Certainty = "suspeito" | "provavel" | "confirmado" | "descartado";
export type Severity = "baixa" | "media" | "alta" | "critica";

export interface CertaintyChange {
  at: string;
  from: Certainty | null;
  to: Certainty;
  by: string | null;
  note: string | null;
}

export interface EventRecord {
  id: string;
  typeCode: string;
  title: string;
  /** instante ISO */
  startsAt: string;
  endsAt: string | null;
  /** Dia produtivo de início e fim (derivados). */
  startDate: string;
  endDate: string | null;
  severity: Severity;
  certainty: Certainty;
  confirmedBy: "clinica" | "laboratorio" | "necropsia" | null;
  description: string | null;
  details: Record<string, unknown>;
  actionTaken: string | null;
  costBrl: number | null;
  source: "usuario" | "plataforma" | "simulado" | "assistente";
  createdBy: string | null;
  createdAt: string;
  completeness: "completo" | "incompleto";
  houses: string[];
  /** lote por galpão no momento do evento */
  flocks: Record<string, string>;
  certaintyHistory: CertaintyChange[];
  /** Marca de cenário (S1…, H1…, rotina) — só simulador/testes. */
  scenario?: string;
}

/** Conjunto completo de dados brutos (o que o contador, sensores e sistema da granja enviariam). */
export interface Dataset {
  seed: number;
  dStart: string;
  dEnd: string;
  farm: FarmInfo;
  houses: House[];
  strains: StrainInfo[];
  flocks: Flock[];
  daily: DailyRecord[];
  eggDaily: DailyEggCount[];
  eggHourly: HourlyEggCount[];
  env: EnvDay[];
  sensors: SensorReading[];
  forecast: WeatherForecastDay[];
  feedBatches: FeedBatch[];
  bodyWeights: BodyWeightSample[];
  lab: LabSample[];
  shelfLife: ShelfLifeTest[];
  prices: WeeklyPrices[];
  costParams: Record<string, number>;
  events: EventRecord[];
}

/** Índices auxiliares para acesso rápido (montados uma vez por Dataset). */
export interface DatasetIndex {
  houseByCode: Map<string, House>;
  flockByCode: Map<string, Flock>;
  daily: Map<string, Map<string, DailyRecord>>; // house → date → record
  egg: Map<string, Map<string, DailyEggCount>>;
  env: Map<string, Map<string, EnvDay>>; // house ("EXT" = externo) → date
  pricesByWeek: Map<string, WeeklyPrices>;
  bodyWeights: Map<string, BodyWeightSample[]>; // house → ordenado por data
  lab: Map<string, LabSample[]>; // house → ordenado por data
  flocksByHouse: Map<string, Flock[]>; // ordenado por startDate
}

export const EXT = "EXT";

export function buildIndex(ds: Dataset): DatasetIndex {
  const nest = <T extends { date: string }>(rows: T[], key: (r: T) => string) => {
    const m = new Map<string, Map<string, T>>();
    for (const r of rows) {
      const k = key(r);
      let inner = m.get(k);
      if (!inner) m.set(k, (inner = new Map()));
      inner.set(r.date, r);
    }
    return m;
  };
  const group = <T extends { date: string }>(rows: T[], key: (r: T) => string) => {
    const m = new Map<string, T[]>();
    for (const r of rows) {
      const k = key(r);
      let arr = m.get(k);
      if (!arr) m.set(k, (arr = []));
      arr.push(r);
    }
    for (const arr of m.values()) arr.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return m;
  };
  const flocksByHouse = new Map<string, Flock[]>();
  for (const f of ds.flocks) {
    let arr = flocksByHouse.get(f.houseCode);
    if (!arr) flocksByHouse.set(f.houseCode, (arr = []));
    arr.push(f);
  }
  for (const arr of flocksByHouse.values()) arr.sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
  return {
    houseByCode: new Map(ds.houses.map((h) => [h.code, h])),
    flockByCode: new Map(ds.flocks.map((f) => [f.code, f])),
    daily: nest(ds.daily, (r) => r.house),
    egg: nest(ds.eggDaily, (r) => r.house),
    env: nest(ds.env, (r) => r.house ?? EXT),
    pricesByWeek: new Map(ds.prices.map((p) => [p.weekStart, p])),
    bodyWeights: group(ds.bodyWeights, (r) => r.house),
    lab: group(ds.lab, (r) => r.house),
    flocksByHouse,
  };
}

/** Lote alojado num galpão numa data (ou undefined em vazio sanitário). */
export function flockAt(idx: DatasetIndex, house: string, date: string): Flock | undefined {
  const arr = idx.flocksByHouse.get(house);
  if (!arr) return undefined;
  for (const f of arr) {
    if (f.startDate <= date && (f.endDate == null || date <= f.endDate)) return f;
  }
  return undefined;
}
