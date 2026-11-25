/**
 * Textos determinísticos dos relatórios (Parte 15.1): frases montadas a partir dos números, sem IA.
 */
const nf = (v: number, d = 1) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
const signed = (v: number, d = 1) => `${v >= 0 ? "+" : "−"}${nf(Math.abs(v), d)}`;

export interface ChangeInput {
  posture: number | null;
  posturePrev: number | null;
  mort: number | null;
  mortPrev: number | null;
  defects: number | null;
  defectsPrev: number | null;
  margin: number | null;
  marginPrev: number | null;
  worstHouse: { house: string; dev: number } | null;
  bestHouse: { house: string; dev: number } | null;
  openAlerts: number;
  newAlerts: number;
  negativeMargin: string[];
}

/** "3 frases do que mudou" (página 1). */
export function whatChanged(i: ChangeInput): string[] {
  const out: string[] = [];
  if (i.posture != null && i.posturePrev != null) {
    const d = i.posture - i.posturePrev;
    const pieces = [`Postura da granja em ${nf(i.posture)}% (${signed(d)} p.p. contra a semana anterior)`];
    if (i.defects != null && i.defectsPrev != null) pieces.push(`avarias + sujos em ${nf(i.defects, 2)}% (${signed(i.defects - i.defectsPrev, 2)} p.p.)`);
    out.push(`${pieces.join("; ")}.`);
  }
  if (i.worstHouse && i.worstHouse.dev < -1)
    out.push(`O ${i.worstHouse.house} é o galpão mais abaixo do padrão interno (${signed(i.worstHouse.dev)} p.p.)${i.bestHouse && i.bestHouse.dev > 0 ? `; o ${i.bestHouse.house} é o mais acima (${signed(i.bestHouse.dev)} p.p.)` : ""}.`);
  else if (i.bestHouse) out.push(`Todos os galpões estão perto do padrão interno; o ${i.bestHouse.house} lidera (${signed(i.bestHouse.dev)} p.p.).`);
  const al = `${i.newAlerts} alerta(s) novo(s) na semana e ${i.openAlerts} em aberto no fim da semana`;
  if (i.negativeMargin.length) out.push(`${al}; margem estimada negativa em ${i.negativeMargin.join(", ")}.`);
  else if (i.margin != null && i.marginPrev != null) out.push(`${al}; margem estimada da granja ${i.margin >= i.marginPrev ? "subiu" : "caiu"} para R$ ${nf(i.margin / 1000, 1)} mil.`);
  else out.push(`${al}.`);
  return out.slice(0, 3);
}

/** Pontos de atenção e sugestões para o WBR (página 9 do Comparativo). */
export function conclusions(i: { worsened: Array<{ label: string; detail: string }>; improved: Array<{ label: string; detail: string }>; criticalAlerts: string[]; negativeMargin: string[]; belowStandard: string[] }): { attention: string[]; suggestions: string[] } {
  const attention: string[] = [];
  for (const w of i.worsened.slice(0, 3)) attention.push(`${w.label}: ${w.detail}.`);
  if (i.criticalAlerts.length) attention.push(`Alertas graves em aberto: ${i.criticalAlerts.slice(0, 3).join("; ")}.`);
  if (i.negativeMargin.length) attention.push(`Margem estimada negativa: ${i.negativeMargin.join(", ")}.`);
  const suggestions: string[] = [];
  if (i.criticalAlerts.length) suggestions.push("Definir responsável e prazo para cada alerta grave em aberto.");
  if (i.belowStandard.length) suggestions.push(`Revisar na ficha do galpão os lotes abaixo do padrão interno (${i.belowStandard.join(", ")}) e conferir as hipóteses do motor de causas.`);
  if (i.negativeMargin.length) suggestions.push("Discutir a decisão de descarte dos lotes com margem negativa (tela Financeiro → Decisão de descarte).");
  if (i.improved.length) suggestions.push(`Registrar o que funcionou: ${i.improved.slice(0, 2).map((x) => x.label.toLowerCase()).join(" e ")}.`);
  suggestions.push("Conferir a situação das decisões da reunião anterior antes de abrir novas.");
  return { attention: attention.length ? attention : ["Nenhuma piora relevante na semana."], suggestions: suggestions.slice(0, 5) };
}
