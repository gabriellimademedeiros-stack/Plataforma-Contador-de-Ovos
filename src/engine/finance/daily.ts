/** Financeiro diário por galpão (Parte 12.1). Todos os valores são "Estimado" (parâmetros simulados). */
import type { ClassCounts, WeeklyPrices } from "@/engine/types";

export interface FinanceDayInput {
  counts: ClassCounts;
  feedKg: number;
  birds: number;
  birdsHoused: number;
  /** Dias previstos de produção: do alojamento até o descarte planejado. */
  plannedDays: number;
  prices: Pick<WeeklyPrices, "ovo_comercial_dz" | "ovo_trincado_dz" | "ovo_sujo_dz" | "racao_kg" | "ave_descarte_un">;
  cost: Record<string, number>;
  eventCost?: number;
}

export interface FinanceDay {
  eggs: number;
  dzClean: number;
  receita: number;
  receitaComercial: number;
  receitaTrincado: number;
  receitaSujo: number;
  custoRacao: number;
  custoEmbalagem: number;
  custoOverhead: number;
  custoFixo: number;
  custoAve: number;
  custoSanidade: number;
  custo: number;
  margem: number;
  custoDz: number | null;
  margemDz: number | null;
  /** Postura de equilíbrio (%). */
  equilibrio: number | null;
}

export function fixedCostPerDay(cost: Record<string, number>): number {
  return ((cost.mao_de_obra_mes + cost.energia_mes + cost.depreciacao_manutencao_mes) * 12) / 365;
}

export function financeDay(i: FinanceDayInput): FinanceDay {
  const c = i.counts;
  const eggs = c.clean + c.dirty_feces + c.dirty_blood + c.cracked + c.broken + c.undetermined;
  const dzClean = (c.clean + c.undetermined) / 12;
  const receitaComercial = dzClean * i.prices.ovo_comercial_dz;
  const receitaTrincado = (c.cracked / 12) * i.prices.ovo_trincado_dz;
  const receitaSujo = ((c.dirty_feces + c.dirty_blood) / 12) * i.prices.ovo_sujo_dz;
  const receita = receitaComercial + receitaTrincado + receitaSujo;
  const custoRacao = i.feedKg * i.prices.racao_kg;
  const custoEmbalagem = dzClean * i.cost.embalagem_dz;
  const custoOverhead = (eggs / 12) * i.cost.overhead_dz;
  const custoFixo = fixedCostPerDay(i.cost);
  const custoAve = (i.birdsHoused * (i.cost.custo_franga - i.prices.ave_descarte_un)) / i.plannedDays;
  const custoSanidade = (i.birds * i.cost.sanidade_ave_semana) / 7 + (i.eventCost ?? 0);
  const custo = custoRacao + custoEmbalagem + custoOverhead + custoFixo + custoAve + custoSanidade;
  const margem = receita - custo;
  const dz = eggs / 12;
  const receitaPorOvo = eggs > 0 ? receita / eggs : 0;
  return {
    eggs,
    dzClean,
    receita,
    receitaComercial,
    receitaTrincado,
    receitaSujo,
    custoRacao,
    custoEmbalagem,
    custoOverhead,
    custoFixo,
    custoAve,
    custoSanidade,
    custo,
    margem,
    custoDz: dz > 0 ? custo / dz : null,
    margemDz: dz > 0 ? margem / dz : null,
    equilibrio: receitaPorOvo > 0 && i.birds > 0 ? (custo / (receitaPorOvo * i.birds)) * 100 : null,
  };
}

/** Perda por defeitos (Parte 6.2): Σ (preço comercial − preço do destino) × qtd ÷ 12. */
export function defectLoss(c: ClassCounts, p: FinanceDayInput["prices"]): number {
  return (
    ((p.ovo_comercial_dz - p.ovo_trincado_dz) * c.cracked +
      (p.ovo_comercial_dz - p.ovo_sujo_dz) * (c.dirty_feces + c.dirty_blood) +
      p.ovo_comercial_dz * c.broken) /
    12
  );
}

/** Postura de equilíbrio sobre totais de um período (nunca média das diárias). */
export function breakEvenPosture(custo: number, receita: number, eggs: number, birdDays: number): number | null {
  if (receita <= 0 || eggs <= 0 || birdDays <= 0) return null;
  return ((custo * eggs) / (receita * birdDays)) * 100;
}
