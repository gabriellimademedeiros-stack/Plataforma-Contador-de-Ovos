/**
 * Cenários recentes plantados (S1–S9, Parte 7.11) e casos históricos (H1–H6, Parte 7.12).
 * Datas relativas a D_end (âncora do reset). Efeitos somam-se ao modelo de base.
 * Intensidade I escala o efeito: multiplicador m → 1 + (m − 1)·I; aditivo a → a·I; λ → λ·I.
 */
import { addDays, diffDays } from "@/lib/dates";
import type { EggClass, Flock } from "@/engine/types";

export interface DayEffects {
  posturaPP: number;
  waterMul: number;
  feedMul: number;
  eggWeightAdd: number;
  extraDeaths: Array<{ lambda?: number; fixed?: number; cause: string }>;
  classMul: Partial<Record<EggClass, number>>;
  laneMul: { 1: Partial<Record<EggClass, number>>; 2: Partial<Record<EggClass, number>> };
  laneShare1: Partial<Record<EggClass, number>>;
  nh3Add: number;
  lab: { haugh: number; strength: number; gravity: number };
}

export function noEffects(): DayEffects {
  return {
    posturaPP: 0,
    waterMul: 1,
    feedMul: 1,
    eggWeightAdd: 0,
    extraDeaths: [],
    classMul: {},
    laneMul: { 1: {}, 2: {} },
    laneShare1: {},
    nh3Add: 0,
    lab: { haugh: 0, strength: 0, gravity: 0 },
  };
}

/** Intensidades ajustáveis dos cenários (registrar mudanças em docs/DECISOES.md). */
export const SCENARIO_INTENSITY: Record<string, number> = {
  S2: 1,
  S3: 1,
  S4: 1,
  S5: 1,
  S6: 1,
  S8: 1,
  S9: 1,
  H3: 0.9,
  H4: 1,
  H5: 0.8,
  H6: 1,
};

/** Ondas de calor: máximas externas forçadas (valores absolutos). */
export const HEAT_WAVES = {
  S1: { start: -20, tmax: [38.5, 39.5, 40.0, 39.5, 38.0, 36.5, 35.5], waveDays: 5 },
  H1: { start: -383, tmax: [38.5, 39.5, 39.5, 38.0], waveDays: 4 },
  H2: { start: -745, tmax: [38.0, 39.0, 39.0, 37.5], waveDays: 4 },
};

/** S9: temperaturas internas forçadas 01h–04h no calendário D−11 (madrugada do dia produtivo D−12). */
export const S9_FORCED = { house: "P002", calendarOffset: -11, hours: [1, 2, 3, 4], temps: [33.5, 35.2, 34.8, 33.0] };

export interface ScenarioContext {
  dEnd: string;
  flocksByHouse: Map<string, Flock[]>;
  intensity?: Record<string, number>;
}

export interface ScenarioDates {
  H3: { house: string; flock: string; start: string } | null;
  H5: { house: string; flock: string; start: string } | null;
}

/** Datas absolutas dos casos ligados à idade de lotes anteriores (H3: 38 semanas; H5: 24 semanas). */
export function scenarioDates(ctx: ScenarioContext): ScenarioDates {
  const prev = (house: string) => {
    const arr = ctx.flocksByHouse.get(house) ?? [];
    const cur = arr.find((f) => f.endDate == null);
    const before = arr.filter((f) => f !== cur).sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
    return before[0];
  };
  const p5 = prev("P005");
  const p4 = prev("P004");
  return {
    H3: p5 ? { house: "P005", flock: p5.code, start: addDays(p5.hatchDate, 38 * 7) } : null,
    H5: p4 ? { house: "P004", flock: p4.code, start: addDays(p4.hatchDate, 24 * 7) } : null,
  };
}

const sc = (m: number, I: number) => 1 + (m - 1) * I;

function lerp(t: number, t0: number, v0: number, t1: number, v1: number) {
  if (t1 === t0) return v1;
  return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
}

/** Formato da bronquite (S2/H3). t = dias desde o início (D−45 no S2). */
function applyBronchitis(e: DayEffects, t: number, I: number, permanentUntil: number) {
  if (t < 0 || t > permanentUntil) return;
  // água
  if (t === 0) e.waterMul *= sc(0.93, I);
  else if (t === 1) e.waterMul *= sc(0.87, I);
  else if (t >= 2 && t <= 5) e.waterMul *= sc(0.9, I);
  else if (t >= 6 && t <= 10) e.waterMul *= sc(0.96, I);
  // ração
  if (t >= 2 && t <= 7) e.feedMul *= sc(0.95, I);
  else if (t >= 8 && t <= 12) e.feedMul *= sc(0.97, I);
  // postura
  let pp = 0;
  if (t >= 1 && t <= 10) pp = lerp(t, 1, 0, 10, 12);
  else if (t > 10 && t <= 25) pp = lerp(t, 10, 12, 25, 5);
  else if (t > 25) pp = 4;
  e.posturaPP += pp * I;
  // trincados
  if (t >= 4 && t <= 17) e.classMul.cracked = (e.classMul.cracked ?? 1) * sc(2.0, I);
  else if (t >= 18 && t <= 25) e.classMul.cracked = (e.classMul.cracked ?? 1) * sc(1.5, I);
  else if (t > 25) e.classMul.cracked = (e.classMul.cracked ?? 1) * sc(1.15, I);
  // sujos de fezes
  if (t >= 3 && t <= 15) e.classMul.dirty_feces = (e.classMul.dirty_feces ?? 1) * sc(1.3, I);
  // mortes extras
  if (t >= 3 && t <= 13) e.extraDeaths.push({ lambda: 5 * I, cause: "doenca_respiratoria" });
  // peso do ovo
  if (t >= 5 && t <= 20) e.eggWeightAdd += -1.0 * I;
  // laboratório
  if (t >= 5 && t <= 25) {
    e.lab.haugh += -6 * I;
    e.lab.strength += -0.4 * I;
  }
}

/** Formato da falha de bebedouro (S3/H4). */
function applyDrinker(e: DayEffects, t: number, I: number) {
  if (t === 0) {
    e.waterMul *= sc(0.6, I);
    e.feedMul *= sc(0.85, I);
  } else if (t === 1) {
    e.posturaPP += 2.0 * I;
    e.waterMul *= sc(0.97, I);
    e.feedMul *= sc(0.92, I);
  }
}

/** Formato do prolapso em lote jovem (S6/H5). t = dias desde o início (D−21 no S6); duração 15 dias. */
function applyProlapse(e: DayEffects, t: number, I: number) {
  if (t >= 0 && t <= 14) e.classMul.dirty_blood = (e.classMul.dirty_blood ?? 1) * sc(3.0, I);
  if (t >= 2 && t <= 11) e.extraDeaths.push({ lambda: 25 * I, cause: "prolapso" });
  else if (t >= 12 && t <= 14) e.extraDeaths.push({ lambda: 8 * I, cause: "prolapso" });
  if (t >= -3 && t <= 14) e.eggWeightAdd += 1.5 * I;
}

/** Problema de esteira numa pista (S5/H6). */
function applyBelt(e: DayEffects, lane: 1 | 2, I: number) {
  e.laneMul[lane].cracked = (e.laneMul[lane].cracked ?? 1) * sc(3.0, I);
  e.laneMul[lane].broken = (e.laneMul[lane].broken ?? 1) * sc(4.0, I);
}

/** Multiplicador de trincados do S4 (carga com cálcio baixo) no dia relativo r = date − D_end. */
export function s4CrackedMul(r: number): number {
  if (r < -21) return 1;
  if (r <= -13) return lerp(r, -21, 1.0, -13, 1.6);
  if (r <= -8) return 1.6;
  if (r <= 0) return lerp(r, -8, 1.6, 0, 1.2);
  if (r <= 10) return lerp(r, 0, 1.2, 10, 1.0); // avanço diário: volta a ×1,0 em 10 dias
  return 1;
}

export const S4_HOUSES = ["P001", "P002", "P004"];

/**
 * Efeitos de todos os cenários num galpão e dia produtivo.
 */
export function effectsFor(
  house: string,
  flock: string,
  date: string,
  ctx: ScenarioContext,
  dates: ScenarioDates,
): DayEffects {
  const e = noEffects();
  const I = { ...SCENARIO_INTENSITY, ...(ctx.intensity ?? {}) };
  const r = diffDays(ctx.dEnd, date); // dia relativo (D−20 → −20)

  // S2 — bronquite no P003, início D−45, −4 p.p. permanente depois
  if (house === "P003") applyBronchitis(e, r + 45, I.S2, Infinity);

  // S3 — falha de bebedouro no P006 em D−9
  if (house === "P006") applyDrinker(e, r + 9, I.S3);

  // S4 — carga de ração com cálcio baixo (grupo A)
  if (S4_HOUSES.includes(house) && r >= -21) {
    const m = s4CrackedMul(r);
    const mi = sc(m, I.S4);
    e.classMul.cracked = (e.classMul.cracked ?? 1) * mi;
    if (r <= 0) e.classMul.broken = (e.classMul.broken ?? 1) * sc(1 + ((m - 1) / 0.6) * 0.3, I.S4);
    if (r >= -18 && r <= -1) {
      e.lab.strength += -0.45 * I.S4;
      e.lab.gravity += -0.004 * I.S4;
    }
  }

  // S5 — esteira da pista 2 no P007, de D−6 em diante (continua)
  if (house === "P007" && r >= -6) applyBelt(e, 2, I.S5);

  // S6 — prolapso no P008, D−21 a D−7
  if (house === "P008") applyProlapse(e, r + 21, I.S6);

  // S8 — anomalia sem causa no P004, de D−4 em diante (continua)
  if (house === "P004" && r >= -4) {
    e.classMul.dirty_feces = (e.classMul.dirty_feces ?? 1) * sc(1.5, I.S8);
    e.laneShare1.dirty_feces = 0.5 + 0.2 * I.S8;
    e.waterMul *= sc(1.09, I.S8);
    e.nh3Add += 5 * I.S8;
  }

  // S9 — queda de energia no P002: mortes no dia produtivo D−12, postura −1,5 p.p. em D−11
  if (house === "P002") {
    if (r === -12) e.extraDeaths.push({ fixed: Math.round(190 * I.S9), cause: "calor" });
    if (r === -11) e.posturaPP += 1.5 * I.S9;
  }

  // H3 — bronquite confirmada no P005, lote anterior, aos 38 semanas (intensidade 0,9)
  if (dates.H3 && house === dates.H3.house && flock === dates.H3.flock) {
    const t = diffDays(dates.H3.start, date);
    applyBronchitis(e, t, I.H3, Infinity);
  }
  // H4 — falha de bebedouro no P002 (lote atual) em D−200
  if (house === "P002") applyDrinker(e, r + 200, I.H4);
  // H5 — prolapso no P004, lote anterior, aos 24 semanas (intensidade 0,8)
  if (dates.H5 && house === dates.H5.house && flock === dates.H5.flock) applyProlapse(e, diffDays(dates.H5.start, date), I.H5);
  // H6 — esteira da pista 1 no P001 (lote atual), D−150 a D−146
  if (house === "P001" && r >= -150 && r <= -146) applyBelt(e, 1, I.H6);

  return e;
}

/** Lista de cenários com datas absolutas e galpões — usada pelas telas de validação e pelos testes. */
export interface ScenarioInfo {
  code: string;
  name: string;
  houses: string[];
  start: string;
  end: string;
  expectedRules: string[];
  hasEvent: boolean;
}

export function scenarioCatalog(dEnd: string, dates: ScenarioDates, activeHousesAt: (date: string) => string[]): ScenarioInfo[] {
  const d = (o: number) => addDays(dEnd, o);
  const list: ScenarioInfo[] = [
    { code: "S1", name: "Onda de calor", houses: activeHousesAt(d(-20)), start: d(-20), end: d(-14), expectedRules: ["A11"], hasEvent: true },
    { code: "S2", name: "Bronquite infecciosa", houses: ["P003"], start: d(-45), end: d(-20), expectedRules: ["A08", "A03"], hasEvent: true },
    { code: "S3", name: "Falha de bebedouro", houses: ["P006"], start: d(-9), end: d(-8), expectedRules: ["A08"], hasEvent: true },
    { code: "S4", name: "Carga de ração com cálcio baixo", houses: S4_HOUSES, start: d(-21), end: dEnd, expectedRules: ["A14"], hasEvent: false },
    { code: "S5", name: "Problema de esteira na pista 2", houses: ["P007"], start: d(-6), end: dEnd, expectedRules: ["A15"], hasEvent: false },
    { code: "S6", name: "Prolapso em lote jovem", houses: ["P008"], start: d(-21), end: d(-7), expectedRules: ["A17"], hasEvent: true },
    { code: "S7", name: "Vacinação de rotina", houses: ["P002"], start: d(-25), end: d(-25), expectedRules: [], hasEvent: true },
    { code: "S8", name: "Anomalia sem causa registrada", houses: ["P004"], start: d(-4), end: dEnd, expectedRules: ["A16"], hasEvent: false },
    { code: "S9", name: "Queda de energia à noite", houses: ["P002"], start: d(-12), end: d(-11), expectedRules: ["A11", "A06"], hasEvent: true },
    { code: "H1", name: "Onda de calor (histórico)", houses: activeHousesAt(d(-383)), start: d(-383), end: d(-380), expectedRules: ["A11"], hasEvent: true },
    { code: "H2", name: "Onda de calor (histórico)", houses: activeHousesAt(d(-745)), start: d(-745), end: d(-742), expectedRules: ["A11"], hasEvent: true },
  ];
  if (dates.H3)
    list.push({ code: "H3", name: "Bronquite confirmada (histórico)", houses: ["P005"], start: dates.H3.start, end: addDays(dates.H3.start, 25), expectedRules: ["A08", "A03"], hasEvent: true });
  list.push({ code: "H4", name: "Falha de bebedouro (histórico)", houses: ["P002"], start: d(-200), end: d(-199), expectedRules: ["A08"], hasEvent: true });
  if (dates.H5)
    list.push({ code: "H5", name: "Prolapso em lote jovem (histórico)", houses: ["P004"], start: dates.H5.start, end: addDays(dates.H5.start, 14), expectedRules: ["A17"], hasEvent: true });
  list.push({ code: "H6", name: "Problema de esteira na pista 1 (histórico)", houses: ["P001"], start: d(-150), end: d(-146), expectedRules: ["A15"], hasEvent: true });
  return list;
}
