/** As 12 perguntas sugeridas (Parte 13.7). Arquivo sem dependências de servidor: usado também no navegador. */
export const SUGGESTED_QUESTIONS = [
  "Qual galpão teve mais trincados na última semana?",
  "Por que a postura do P005 caiu durante a onda de calor?",
  "O que pode estar causando os trincados do P007?",
  "Já tivemos algo parecido com o problema do P007 antes?",
  "Compare o P001 com o P006 nas últimas 4 semanas.",
  "Qual linhagem está melhor em ovo por ave alojada?",
  "Plote temperatura máxima, água e postura do P003 nos últimos 60 dias.",
  "Quantas caixas vamos produzir nas próximas 4 semanas?",
  "Vale manter o L107 por mais 8 semanas?",
  "Se o preço do ovo cair 10%, quais galpões ficam no vermelho?",
  "Quais alertas estão abertos agora?",
  "Registra que vacinamos o P002 contra bronquite hoje de manhã.",
];

/** Perguntas que dependem de dados financeiros (escondidas para quem não vê finanças). */
const FINANCE = new Set([8, 9]);
/** Lote citado → galpão (lotes atuais L101–L108 ficam em P001–P008). */
const flockHouse = (l: string) => `P00${Number(l.slice(1)) - 100}`;

export function filterSuggestions(houseCodes: string[], canSeeFinance: boolean, canRegister = true): string[] {
  const hs = new Set(houseCodes);
  return SUGGESTED_QUESTIONS.filter((q, i) => {
    if (FINANCE.has(i) && !canSeeFinance) return false;
    if (i === 11 && !canRegister) return false;
    const cited = [...(q.match(/P\d{3}/g) ?? []), ...(q.match(/L1\d{2}/g) ?? []).map(flockHouse)];
    return cited.every((h) => hs.has(h));
  });
}
