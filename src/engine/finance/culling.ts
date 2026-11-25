/**
 * Decisão de descarte (Parte 12.6): projeta 16 semanas de postura (curva da linhagem + ajuste do lote), mortes (padrão),
 * ovos, receita e custos EVITÁVEIS. A amortização da franga e a depreciação não entram (já foram gastas e não mudam com a decisão).
 */
import { addDays, ageWeeksDecimal } from "@/lib/dates";
import type { StrainStandards } from "@/engine/standards/strain";

export interface CullingInput {
  flock: string;
  strainCode: string;
  hatchDate: string;
  from: string;
  birds: number;
  adjustment: number;
  /** participação das classes nos ovos (última semana): comercial, trincado, sujo, quebrado */
  shares: { commercial: number; cracked: number; dirty: number; broken: number };
  prices: { egg: number; cracked: number; dirty: number; feed: number };
  cost: Record<string, number>;
  weeks?: number;
}

export interface CullingWeek {
  week: number;
  weekStart: string;
  ageWeek: number;
  posture: number;
  birds: number;
  eggs: number;
  revenue: number;
  avoidableCost: number;
  contribution: number;
}

export interface CullingResult {
  weeks: CullingWeek[];
  recommendedWeek: number | null;
  recommendedDate: string | null;
  /** "margem": primeira semana com 2 semanas seguidas negativas; "planejado": a margem segue positiva e vale o descarte planejado */
  basis: "margem" | "planejado" | null;
}

export function projectCulling(i: CullingInput, std: StrainStandards, plannedCullDate?: string): CullingResult {
  const n = i.weeks ?? 16;
  const out: CullingWeek[] = [];
  let birds = i.birds;
  const fixedAvoidable = ((i.cost.mao_de_obra_mes + i.cost.energia_mes) * 12 * (i.cost.parcela_evitavel_fixos ?? 0.5)) / 365;
  for (let k = 1; k <= n; k++) {
    const ws = addDays(i.from, 7 * (k - 1));
    let eggs = 0;
    let revenue = 0;
    let cost = 0;
    let postureSum = 0;
    for (let dd = 0; dd < 7; dd++) {
      const d = addDays(ws, dd);
      const w = ageWeeksDecimal(d, i.hatchDate);
      const p = Math.max(0, (std.at(i.strainCode, "prod.postura", w) ?? 0) + i.adjustment);
      const e = (birds * p) / 100;
      const dz = e / 12;
      eggs += e;
      postureSum += p;
      revenue += dz * (i.shares.commercial * i.prices.egg + i.shares.cracked * i.prices.cracked + i.shares.dirty * i.prices.dirty);
      const feed = (birds * (std.at(i.strainCode, "nut.racao", w) ?? 110)) / 1000;
      cost += feed * i.prices.feed + dz * i.shares.commercial * i.cost.embalagem_dz + dz * i.cost.overhead_dz + (birds * i.cost.sanidade_ave_semana) / 7 + fixedAvoidable;
      const weekly = w < 26 ? 0.09 : w < 74 ? 0.07 : 0.1;
      birds -= (birds * weekly) / 7 / 100;
    }
    out.push({ week: k, weekStart: ws, ageWeek: Math.floor(ageWeeksDecimal(ws, i.hatchDate)), posture: postureSum / 7, birds, eggs, revenue, avoidableCost: cost, contribution: revenue - cost });
  }
  let rec: number | null = null;
  for (let k = 0; k < out.length - 1; k++) {
    if (out[k].contribution < 0 && out[k + 1].contribution < 0) {
      rec = out[k].week;
      break;
    }
  }
  if (rec) return { weeks: out, recommendedWeek: rec, recommendedDate: out[rec - 1].weekStart, basis: "margem" };
  // sem duas semanas negativas: recomenda o descarte planejado (se cair no horizonte)
  if (plannedCullDate) {
    const k = out.findIndex((w) => addDays(w.weekStart, 6) >= plannedCullDate);
    if (k >= 0) return { weeks: out, recommendedWeek: out[k].week, recommendedDate: plannedCullDate, basis: "planejado" };
  }
  return { weeks: out, recommendedWeek: null, recommendedDate: null, basis: null };
}
