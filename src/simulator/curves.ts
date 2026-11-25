/** Curvas das linhagens fictícias (Parte 7.4). w = idade decimal em semanas (válidas para w ≥ 17). */
import { STRAINS, type StrainParams } from "./config";

export function strainParams(code: string): StrainParams {
  const s = STRAINS.find((x) => x.code === code);
  if (!s) throw new Error(`Linhagem desconhecida: ${code}`);
  return s;
}

export function curvePostura(s: StrainParams, w: number): number {
  return s.Ppk / (1 + Math.exp(-s.kr * (w - s.cr))) - s.d * Math.max(0, w - s.wpk);
}
export function curveEggWeight(s: StrainParams, w: number): number {
  return s.Emax - (s.Emax - s.E18) * Math.exp(-s.kE * (w - 18));
}
export function curveBodyWeight(s: StrainParams, w: number): number {
  return s.Bmax - (s.Bmax - s.B18) * Math.exp(-s.kB * (w - 18));
}
export function curveFeed(s: StrainParams, w: number): number {
  return s.Fad - (s.Fad - s.F18) * Math.exp(-s.kF * (w - 18));
}
export function curveWater(s: StrainParams, w: number): number {
  return 1.9 * curveFeed(s, w);
}
export function curveEggMass(s: StrainParams, w: number): number {
  return (curvePostura(s, w) * curveEggWeight(s, w)) / 100;
}
/** Mortalidade semanal padrão (%). */
export function weeklyMortalityStd(w: number): number {
  if (w < 26) return 0.09;
  if (w < 74) return 0.07;
  return 0.1;
}

/**
 * Tabela semanal (semanas 17 a 100) com as 8 métricas de strain_standards (Parte 6.9).
 * Valores semanais avaliados na idade inteira da semana; acumulados somam desde a semana 17.
 */
export function strainStandardTable(s: StrainParams): Array<{ ageWeek: number; metric: string; value: number }> {
  const rows: Array<{ ageWeek: number; metric: string; value: number }> = [];
  let mortCum = 0;
  let oaa = 0;
  for (let w = 17; w <= 100; w++) {
    mortCum += weeklyMortalityStd(w);
    oaa += (curvePostura(s, w) / 100) * 7;
    rows.push({ ageWeek: w, metric: "prod.postura", value: curvePostura(s, w) });
    rows.push({ ageWeek: w, metric: "prod.oaa", value: oaa });
    rows.push({ ageWeek: w, metric: "prod.peso_ovo", value: curveEggWeight(s, w) });
    rows.push({ ageWeek: w, metric: "prod.massa", value: curveEggMass(s, w) });
    rows.push({ ageWeek: w, metric: "mort.acumulada", value: mortCum });
    rows.push({ ageWeek: w, metric: "nut.racao", value: curveFeed(s, w) });
    rows.push({ ageWeek: w, metric: "nut.agua", value: curveWater(s, w) });
    rows.push({ ageWeek: w, metric: "nut.peso_corporal", value: curveBodyWeight(s, w) });
  }
  return rows;
}

/** Valor padrão da linhagem numa idade decimal (interpola acumulados pela tabela semanal). */
export function strainStandardAt(s: StrainParams, metric: string, w: number): number | null {
  if (w < 17) return null;
  switch (metric) {
    case "prod.postura":
      return curvePostura(s, w);
    case "prod.peso_ovo":
      return curveEggWeight(s, w);
    case "prod.massa":
      return curveEggMass(s, w);
    case "nut.racao":
      return curveFeed(s, w);
    case "nut.agua":
      return curveWater(s, w);
    case "nut.peso_corporal":
      return curveBodyWeight(s, w);
    case "mort.acumulada": {
      let acc = 0;
      const wf = Math.floor(w);
      for (let k = 17; k < wf; k++) acc += weeklyMortalityStd(k);
      acc += weeklyMortalityStd(wf) * (w - wf);
      return acc;
    }
    case "prod.oaa": {
      // mesma convenção da tabela: soma de P/100 × 7 por semana desde a 17, fração da semana corrente
      let acc = 0;
      const wf = Math.floor(w);
      for (let k = 17; k < wf; k++) acc += (curvePostura(s, k) / 100) * 7;
      acc += (curvePostura(s, wf) / 100) * 7 * (w - wf);
      return acc;
    }
    default:
      return null;
  }
}
