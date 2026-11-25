/**
 * Simulador de preços (Parte 12.4): o servidor envia as quantidades da última semana completa por galpão e o navegador
 * recalcula margem, margem por dúzia e postura de equilíbrio na hora. Função pura (roda no cliente e no assistente).
 */
export interface PriceSimHouse {
  house: string;
  dzClean: number;
  dzCracked: number;
  dzDirty: number;
  eggs: number;
  birdDays: number;
  feedKg: number;
  /** custos que não dependem do preço do ovo nem da ração (embalagem, overhead, fixos, ave, sanidade) */
  otherCosts: number;
  currentEgg: number;
  currentFeed: number;
}

export interface PriceSimResult {
  house: string;
  receita: number;
  custo: number;
  margem: number;
  margemDz: number | null;
  posture: number | null;
  breakEven: number | null;
}

export function simulatePrices(h: PriceSimHouse, eggPrice: number, feedPrice: number, crackedShare = 0.55, dirtyShare = 0.75): PriceSimResult {
  const receita = h.dzClean * eggPrice + h.dzCracked * eggPrice * crackedShare + h.dzDirty * eggPrice * dirtyShare;
  const custo = h.otherCosts + h.feedKg * feedPrice;
  const margem = receita - custo;
  const dz = h.eggs / 12;
  return {
    house: h.house,
    receita,
    custo,
    margem,
    margemDz: dz > 0 ? margem / dz : null,
    posture: h.birdDays > 0 ? (h.eggs / h.birdDays) * 100 : null,
    breakEven: receita > 0 && h.birdDays > 0 ? ((custo * h.eggs) / (receita * h.birdDays)) * 100 : null,
  };
}
