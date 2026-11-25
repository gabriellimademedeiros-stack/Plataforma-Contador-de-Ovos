/**
 * Ponte de margem (Parte 12.5): da semana de referência (última com margem positiva ou 8 semanas antes) para a atual.
 * Efeitos: preço do ovo, produção, preço da ração, consumo e outros. Substitui as hipóteses no alerta A22.
 */
export interface WeekFinance {
  weekStart: string;
  margin: number;
  dozens: number;
  eggPrice: number;
  feedKg: number;
  feedPrice: number;
}

export interface MarginBridge {
  kind: "margem";
  reference: string;
  current: string;
  steps: Array<{ label: string; value: number }>;
  effects: Record<string, number>;
  sentence: string;
  unit: string;
}

const brl = (v: number) => `${v < 0 ? "−" : "+"}R$ ${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(Math.abs(v))}`;

export function marginBridge(ref: WeekFinance, cur: WeekFinance): MarginBridge {
  const unitMargin = ref.dozens > 0 ? ref.margin / ref.dozens : 0;
  const effects = {
    "Preço do ovo": (cur.eggPrice - ref.eggPrice) * cur.dozens,
    Produção: (cur.dozens - ref.dozens) * unitMargin,
    "Preço da ração": -(cur.feedPrice - ref.feedPrice) * cur.feedKg,
    Consumo: -(cur.feedKg - ref.feedKg) * ref.feedPrice,
  };
  const explained = Object.values(effects).reduce((a, b) => a + b, 0);
  const others = cur.margin - ref.margin - explained;
  const all: Record<string, number> = { ...effects, "Outros (custos fixos e mix)": others };
  const biggest = Object.entries(all).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
  return {
    kind: "margem",
    reference: ref.weekStart,
    current: cur.weekStart,
    unit: "R$",
    effects: all,
    steps: [{ label: "Margem de referência", value: ref.margin }, ...Object.entries(all).map(([label, value]) => ({ label, value })), { label: "Margem atual", value: cur.margin }],
    sentence: `A margem passou de ${brl(ref.margin)} para ${brl(cur.margin)} por semana; o maior efeito foi ${biggest[0].toLowerCase()} (${brl(biggest[1])}).`,
  };
}
