/**
 * Todos os parâmetros do simulador (Parte 7), num só lugar.
 * Valores FICTÍCIOS, escolhidos para parecer plausíveis; não são referência técnica.
 */

export const SIM_DEFAULT_SEED = 20261125;
export const HISTORY_DAYS = 1095; // 3 anos
export const HOURLY_SENSOR_DAYS = 60;
export const HOURLY_COUNTER_DAYS = 30;
export const FORECAST_DAYS = 7;
export const MODEL_VERSION = "egg-cls-1.4.2";
export const GUIDE_EDITION = "Curva fictícia v1";
export const PLANNED_CULL_WEEKS = 90;
export const PLACEMENT_AGE_DAYS = 119; // 17 semanas
export const EMPTY_PERIOD_DAYS = 21; // vazio sanitário
export const CHICK_COST_BRL = 28.0;
export const BASE_LIGHT_HOURS = 16;

export const FARM = {
  tenantName: "Empresa Demonstração (fictícia)",
  name: "Granja Demonstração Sertão",
  city: "Sertão da Paraíba (fictícia)",
  state: "PB",
  lat: -7.7,
  lon: -38.0,
  timezone: "America/Fortaleza",
  cutoffHour: 6,
  weekStartDow: 0,
  systemType: "Gaiolas automatizadas com esteira de coleta",
};

export interface StrainParams {
  code: "ALFA" | "BETA" | "GAMA";
  name: string;
  shellColor: "branco" | "vermelho";
  Ppk: number;
  wpk: number;
  d: number;
  cr: number;
  kr: number;
  Emax: number;
  E18: number;
  kE: number;
  Bmax: number;
  B18: number;
  kB: number;
  Fad: number;
  F18: number;
  kF: number;
}

export const STRAINS: StrainParams[] = [
  {
    code: "ALFA",
    name: "Alfa Branca",
    shellColor: "branco",
    Ppk: 95.5,
    wpk: 28,
    d: 0.42,
    cr: 21.0,
    kr: 1.2,
    Emax: 63.5,
    E18: 44,
    kE: 0.09,
    Bmax: 1650,
    B18: 1250,
    kB: 0.12,
    Fad: 107,
    F18: 92,
    kF: 0.25,
  },
  {
    code: "BETA",
    name: "Beta Vermelha",
    shellColor: "vermelho",
    Ppk: 94.5,
    wpk: 28,
    d: 0.45,
    cr: 21.5,
    kr: 1.2,
    Emax: 64.5,
    E18: 45,
    kE: 0.09,
    Bmax: 1950,
    B18: 1450,
    kB: 0.12,
    Fad: 112,
    F18: 96,
    kF: 0.25,
  },
  {
    code: "GAMA",
    name: "Gama Branca",
    shellColor: "branco",
    Ppk: 96.0,
    wpk: 28,
    d: 0.4,
    cr: 21.0,
    kr: 1.25,
    Emax: 63.0,
    E18: 44,
    kE: 0.09,
    Bmax: 1620,
    B18: 1230,
    kB: 0.12,
    Fad: 105,
    F18: 90,
    kF: 0.25,
  },
];

export interface HouseConfig {
  code: string;
  capacity: number;
  currentFlock: string;
  strain: StrainParams["code"];
  birdsHoused: number;
  ageWeeksAtEnd: number;
  coolingDelta: number;
  qualityOffset: number;
  /** Linhagens dos lotes anteriores, do mais recente para o mais antigo. */
  previousStrains: StrainParams["code"][];
  builtYear: number;
}

export const HOUSES: HouseConfig[] = [
  { code: "P001", capacity: 105000, currentFlock: "L101", strain: "ALFA", birdsHoused: 100000, ageWeeksAtEnd: 52, coolingDelta: 6.0, qualityOffset: 0.5, previousStrains: ["BETA", "ALFA"], builtYear: 2014 },
  { code: "P002", capacity: 95000, currentFlock: "L102", strain: "BETA", birdsHoused: 90000, ageWeeksAtEnd: 64, coolingDelta: 6.0, qualityOffset: 0.5, previousStrains: ["ALFA", "GAMA"], builtYear: 2014 },
  { code: "P003", capacity: 115000, currentFlock: "L103", strain: "ALFA", birdsHoused: 110000, ageWeeksAtEnd: 41, coolingDelta: 6.0, qualityOffset: 0.2, previousStrains: ["ALFA", "BETA"], builtYear: 2016 },
  { code: "P004", capacity: 85000, currentFlock: "L104", strain: "GAMA", birdsHoused: 80000, ageWeeksAtEnd: 47, coolingDelta: 6.0, qualityOffset: -0.8, previousStrains: ["GAMA", "ALFA"], builtYear: 2016 },
  { code: "P005", capacity: 100000, currentFlock: "L105", strain: "BETA", birdsHoused: 95000, ageWeeksAtEnd: 58, coolingDelta: 4.5, qualityOffset: -1.0, previousStrains: ["BETA", "GAMA"], builtYear: 2012 },
  { code: "P006", capacity: 125000, currentFlock: "L106", strain: "ALFA", birdsHoused: 120000, ageWeeksAtEnd: 33, coolingDelta: 7.0, qualityOffset: 1.0, previousStrains: ["ALFA", "BETA"], builtYear: 2019 },
  { code: "P007", capacity: 90000, currentFlock: "L107", strain: "GAMA", birdsHoused: 85000, ageWeeksAtEnd: 78, coolingDelta: 6.0, qualityOffset: -2.0, previousStrains: ["GAMA", "ALFA"], builtYear: 2010 },
  { code: "P008", capacity: 65000, currentFlock: "L108", strain: "ALFA", birdsHoused: 60000, ageWeeksAtEnd: 27, coolingDelta: 6.0, qualityOffset: 0.3, previousStrains: ["ALFA", "GAMA"], builtYear: 2021 },
];

/** Valor patrimonial fictício por galpão (R$ por vaga de ave). */
export const ASSET_VALUE_PER_BIRD = 45;

/** Desvio do ajuste de qualidade dos lotes anteriores: normal(0; 1,2) p.p. */
export const PREVIOUS_QUALITY_SD = 1.2;

// --- Clima (Parte 7.7) --------------------------------------------------------
export const CLIMATE = {
  tmaxMean: 33.0,
  tmaxAmp: 2.6,
  tmaxPeakDoy: 335,
  arCoef: 0.6,
  arSd: 0.9,
  tminOffset: 11.0,
  tminSd: 1.0,
  rhBase: 55,
  rhSlope: 1.2,
  rhWetSeasonAdd: 12, // fevereiro a abril
  rhSd: 5,
  rhMin: 25,
  rhMax: 90,
  // interno
  coolingRef: 22,
  coolingRange: 10,
  coolingClampMax: 1.2,
  internalOffset: 1.0,
  internalSd: 0.4,
  rhInternalAdd: 8,
  rhInternalSd: 3,
  nh3Base: 8,
  nh3NightAdd: 4,
  nh3Sd: 1.5,
  /** Previsão: máximas forçadas em D_end+3 e +4 (alerta preventivo P01). */
  forecastForced: { 3: 37.0, 4: 37.5 } as Record<number, number>,
};

// --- Séries diárias (Parte 7.8) -------------------------------------------------
export const DAILY = {
  heatThreshold: 31, // H1 = max(0, Tint_max − 31)
  posturaHeatCoef: 1.0,
  posturaSd: 0.6,
  eggWeightHeatCoef: 0.25,
  eggWeightSd: 0.3,
  mortHeatCoef: 0.15,
  cullsLambda: 0.5,
  feedHeatCoef: 0.02,
  feedSd: 0.015,
  waterPerFeed: 1.9,
  waterHeatCoef: 0.025,
  waterHeatRef: 25,
  waterSd: 0.02,
};

export const DEATH_CAUSE_SHARES = {
  desconhecida: 0.4,
  refugo: 0.25,
  prolapsoYoung: 0.2, // se w < 30
  prolapso: 0.1,
  calorMax: 0.3,
};

export const BODY_WEIGHT = {
  dow: 3, // quarta-feira
  n: 100,
  heatCoef: 0.004,
  sd: 15,
  cvMean: 8,
  cvSd: 1,
  uniformity: 85,
  uniformityYoung: 80,
  uniformitySd: 3,
};

// --- Classes do contador (Parte 7.9) ------------------------------------------
export const DEFECTS = {
  cracked: { base: 1.2, ageSlope: 0.025, heatCoef: 0.08 },
  broken: { base: 0.35, ageSlope: 0.006 },
  dirtyFeces: { base: 1.3, tempCoef: 0.1, tempRef: 27 },
  dirtyBlood: { base: 0.25, amp: 0.45, tau: 3, startWeek: 20, young: 0.7 },
  undetermined: 0.5,
  rateSd: 0.06,
  laneShareSd: 0.01,
  confMean: 0.95,
  confSd: 0.01,
};

/** Distribuição horária da postura (06h–16h). 75% entre 06h e 11h, pico às 08h. */
export const LAYING_HOUR_WEIGHTS: Record<number, number> = {
  6: 0.08,
  7: 0.15,
  8: 0.2,
  9: 0.15,
  10: 0.1,
  11: 0.07,
  12: 0.07,
  13: 0.06,
  14: 0.05,
  15: 0.04,
  16: 0.03,
};

/** Distribuição horária do consumo de água no dia produtivo (06h → 05h). */
export const WATER_HOUR_WEIGHTS: Record<number, number> = {
  6: 0.06, 7: 0.075, 8: 0.075, 9: 0.07, 10: 0.07, 11: 0.065, 12: 0.06, 13: 0.06, 14: 0.06, 15: 0.06,
  16: 0.055, 17: 0.05, 18: 0.045, 19: 0.04, 20: 0.03, 21: 0.015, 22: 0.005, 23: 0.005,
  0: 0.005, 1: 0.005, 2: 0.005, 3: 0.005, 4: 0.025, 5: 0.035,
};

// --- Laboratório (Parte 7.10) -------------------------------------------------
export const LAB = {
  dow: 4, // quinta-feira
  n: 30,
  strength: { base: 4.1, ageSlope: 0.012, heatCoef: 0.05, sd: 0.12 },
  thickness: { base: 0.39, ageSlope: 0.0004, sd: 0.004 },
  gravity: { base: 1.088, ageSlope: 0.00022, sd: 0.001 },
  haugh: { base: 89, ageSlope: 0.14, heatCoef: 0.5, sd: 1.2 },
  yolk: { base: 7, sd: 0.5 },
};

export const SHELF_LIFE = {
  everyWeeks: 4,
  storageTemp: 25,
  storageRh: 65,
  schedule: [0, 7, 14, 21, 28],
  n: 12,
  haughSlope: 1.05,
  haughQuad: 0.011,
  haughSd: 0.8,
  lossSlope: 0.18,
  lossSd: 0.05,
  airCellBase: 2.5,
  airCellSlope: 0.12,
  /** Teste extra durante a onda de calor (S1): começa em D−18 no P005 com queda de 1,25/dia. */
  extraHouse: "P005",
  extraStartOffset: -18,
  extraSlope: 1.25,
  haughLimit: 60,
};

export const FEED = {
  everyDays: 14,
  groups: { A: ["P001", "P002", "P004"], B: ["P003", "P005", "P006"], C: ["P007", "P008"] } as Record<string, string[]>,
  supplier: "Fábrica de Ração Própria",
  formulation: "Postura fase única",
  calciumSpec: 4.0,
};

// --- Preços (Parte 7.10) -----------------------------------------------------
export const PRICES = {
  eggStart: 5.1,
  eggSd: 0.03,
  eggReversion: 0.1,
  eggMin: 4.5,
  eggMax: 5.8,
  crackedShare: 0.55,
  dirtyShare: 0.75,
  feedStart: 1.95,
  feedSd: 0.015,
  feedReversion: 0.1,
  feedMin: 1.7,
  feedMax: 2.25,
  cullBird: 6.0,
  /** Ponto de partida da calibração das 6 últimas semanas (da mais antiga para a mais recente). */
  calibEgg: [5.1, 5.06, 5.04, 5.05, 5.02, 5.0],
  calibFeed: [1.96, 1.96, 1.97, 1.97, 1.98, 1.98],
  calibEggMin: 4.8,
  calibEggMax: 5.3,
  calibL107Min: -4.0,
  calibL107Max: -1.5,
};

export interface CostParamDef {
  key: string;
  value: number;
  unit: string;
  label: string;
}

export const COST_PARAMS: CostParamDef[] = [
  { key: "mao_de_obra_mes", value: 18000, unit: "R$ por galpão por mês", label: "Mão de obra" },
  { key: "energia_mes", value: 6000, unit: "R$ por galpão por mês", label: "Energia" },
  { key: "depreciacao_manutencao_mes", value: 12000, unit: "R$ por galpão por mês", label: "Depreciação e manutenção" },
  { key: "embalagem_dz", value: 0.35, unit: "R$ por dúzia comercial", label: "Embalagem" },
  { key: "overhead_dz", value: 0.25, unit: "R$ por dúzia produzida", label: "Despesas gerais (overhead)" },
  { key: "sanidade_ave_semana", value: 0.02, unit: "R$ por ave por semana", label: "Sanidade" },
  { key: "custo_franga", value: 28.0, unit: "R$ por ave alojada", label: "Custo da franga pronta" },
  {
    key: "parcela_evitavel_fixos",
    value: 0.5,
    unit: "fração",
    label: "Parcela evitável de mão de obra e energia com o galpão vazio",
  },
];

// --- Dispositivos -------------------------------------------------------------
export const DEVICES = {
  counterModel: MODEL_VERSION,
  counterFirmware: "cnt-fw-2.3.1",
  gatewayFirmware: "gtw-fw-1.8.0",
  confidence: 0.96,
};
