/** Catálogo de métricas da beta (Parte 6). Semeado em `metric_catalog`. */

export type Direction = "maior_melhor" | "menor_melhor" | "neutro";
export type Aggregation = "soma" | "razao" | "media_ponderada" | "ultimo" | "max" | "min";

export interface MetricDef {
  code: string;
  name: string;
  short: string;
  unit: string;
  direction: Direction;
  aggregation: Aggregation;
  decimals: number;
  group: string;
  description: string;
  hasStrainStandard?: boolean;
  /** Métrica de uso interno do motor (não aparece nos seletores comuns). */
  internal?: boolean;
  /** Métrica financeira (bloqueada para o encarregado). */
  finance?: boolean;
}

const G = {
  prod: "Produção",
  qual: "Qualidade do ovo",
  mort: "Mortalidade e viabilidade",
  nut: "Nutrição, água e peso",
  amb: "Ambiência",
  lab: "Laboratório",
  fin: "Financeiro",
  ops: "Operação",
  pista: "Pistas do contador",
};

const m = (d: MetricDef) => d;

export const METRICS: MetricDef[] = [
  // 6.1 Produção
  m({ code: "prod.ovos", name: "Ovos produzidos", short: "Ovos", unit: "ovos", direction: "maior_melhor", aggregation: "soma", decimals: 0, group: G.prod, description: "Soma das contagens do contador no dia (todas as classes e pistas)." }),
  m({ code: "prod.caixas", name: "Caixas", short: "Caixas", unit: "cx", direction: "maior_melhor", aggregation: "soma", decimals: 0, group: G.prod, description: "Ovos ÷ 360 (caixa de 30 dúzias)." }),
  m({ code: "prod.postura", name: "Postura (ave-dia)", short: "Postura", unit: "%", direction: "maior_melhor", aggregation: "razao", decimals: 1, group: G.prod, description: "Ovos do dia ÷ aves presentes × 100.", hasStrainStandard: true }),
  m({ code: "prod.oaa", name: "Ovo por ave alojada", short: "OAA", unit: "ovos/ave", direction: "maior_melhor", aggregation: "ultimo", decimals: 1, group: G.prod, description: "Ovos acumulados desde o alojamento ÷ aves alojadas.", hasStrainStandard: true }),
  m({ code: "prod.peso_ovo", name: "Peso médio do ovo", short: "Peso do ovo", unit: "g", direction: "maior_melhor", aggregation: "media_ponderada", decimals: 1, group: G.prod, description: "Peso médio do ovo apontado no dia (ponderado por ovos).", hasStrainStandard: true }),
  m({ code: "prod.massa", name: "Massa de ovo", short: "Massa", unit: "g/ave/dia", direction: "maior_melhor", aggregation: "media_ponderada", decimals: 1, group: G.prod, description: "Postura × peso do ovo ÷ 100 (ponderado por aves).", hasStrainStandard: true }),
  m({ code: "prod.aproveitamento", name: "Aproveitamento comercial", short: "Aproveitamento", unit: "%", direction: "maior_melhor", aggregation: "razao", decimals: 1, group: G.prod, description: "(Íntegros limpos + indeterminados) ÷ ovos × 100." }),
  m({ code: "prod.desvio_linhagem", name: "Desvio de postura × linhagem", short: "Desvio × linhagem", unit: "p.p.", direction: "maior_melhor", aggregation: "media_ponderada", decimals: 1, group: G.prod, description: "Postura − padrão da linhagem na idade (ponderado por aves)." }),
  m({ code: "prod.desvio_interno", name: "Desvio de postura × padrão interno", short: "Desvio × interno", unit: "p.p.", direction: "maior_melhor", aggregation: "media_ponderada", decimals: 1, group: G.prod, description: "Postura − mediana do padrão interno na idade (só com 3 ou mais lotes); senão usa a curva da linhagem." }),

  // 6.2 Qualidade externa
  m({ code: "qual.trincados", name: "Trincados (%)", short: "Trincados", unit: "%", direction: "menor_melhor", aggregation: "razao", decimals: 2, group: G.qual, description: "Ovos trincados ÷ ovos × 100." }),
  m({ code: "qual.quebrados", name: "Quebrados (%)", short: "Quebrados", unit: "%", direction: "menor_melhor", aggregation: "razao", decimals: 2, group: G.qual, description: "Ovos quebrados ÷ ovos × 100." }),
  m({ code: "qual.sujos_fezes", name: "Sujos de fezes (%)", short: "Sujos de fezes", unit: "%", direction: "menor_melhor", aggregation: "razao", decimals: 2, group: G.qual, description: "Ovos sujos de fezes ÷ ovos × 100." }),
  m({ code: "qual.sujos_sangue", name: "Sujos de sangue (%)", short: "Sujos de sangue", unit: "%", direction: "menor_melhor", aggregation: "razao", decimals: 2, group: G.qual, description: "Ovos sujos de sangue ÷ ovos × 100." }),
  m({ code: "qual.avarias", name: "Avarias (%)", short: "Avarias", unit: "%", direction: "menor_melhor", aggregation: "razao", decimals: 2, group: G.qual, description: "(Trincados + quebrados) ÷ ovos × 100." }),
  m({ code: "qual.sujos", name: "Sujos (fezes + sangue) (%)", short: "Sujos", unit: "%", direction: "menor_melhor", aggregation: "razao", decimals: 2, group: G.qual, description: "(Sujos de fezes + sujos de sangue) ÷ ovos × 100." }),
  m({ code: "qual.indeterminados", name: "Indeterminados (%)", short: "Indeterminados", unit: "%", direction: "menor_melhor", aggregation: "razao", decimals: 2, group: G.qual, description: "Ovos que o contador não conseguiu classificar ÷ ovos × 100." }),
  m({ code: "qual.trincados_pista1", name: "Trincados na pista 1 (%)", short: "Trincados P1", unit: "%", direction: "menor_melhor", aggregation: "razao", decimals: 2, group: G.qual, description: "Trincados da pista 1 ÷ ovos da pista 1 × 100." }),
  m({ code: "qual.trincados_pista2", name: "Trincados na pista 2 (%)", short: "Trincados P2", unit: "%", direction: "menor_melhor", aggregation: "razao", decimals: 2, group: G.qual, description: "Trincados da pista 2 ÷ ovos da pista 2 × 100." }),
  m({ code: "qual.razao_pistas", name: "Razão entre pistas (avarias)", short: "Razão pistas", unit: "×", direction: "menor_melhor", aggregation: "max", decimals: 2, group: G.qual, description: "Maior percentual de avarias entre as pistas ÷ menor percentual." }),
  m({ code: "qual.perda_brl", name: "Perda por defeitos", short: "Perda defeitos", unit: "R$", direction: "menor_melhor", aggregation: "soma", decimals: 2, group: G.qual, description: "Σ por classe de (preço do ovo comercial − preço do destino) × quantidade ÷ 12.", finance: true }),

  // Pistas (uso interno do motor: numeradores e denominadores por pista)
  ...(["quebrados", "avarias", "sujos_fezes", "sujos_sangue"] as const).flatMap((k) =>
    [1, 2].map((lane) =>
      m({ code: `qual.${k}_pista${lane}`, name: `${k.replace("_", " ")} na pista ${lane} (%)`, short: `${k} P${lane}`, unit: "%", direction: "menor_melhor", aggregation: "razao", decimals: 2, group: G.pista, description: `Percentual de ${k.replace("_", " ")} na pista ${lane}.`, internal: true }),
    ),
  ),
  m({ code: "prod.ovos_pista1", name: "Ovos na pista 1", short: "Ovos P1", unit: "ovos", direction: "neutro", aggregation: "soma", decimals: 0, group: G.pista, description: "Ovos contados na pista 1.", internal: true }),
  m({ code: "prod.ovos_pista2", name: "Ovos na pista 2", short: "Ovos P2", unit: "ovos", direction: "neutro", aggregation: "soma", decimals: 0, group: G.pista, description: "Ovos contados na pista 2.", internal: true }),

  // 6.3 Mortalidade
  m({ code: "mort.mortes", name: "Mortes", short: "Mortes", unit: "aves", direction: "menor_melhor", aggregation: "soma", decimals: 0, group: G.mort, description: "Aves mortas no dia." }),
  m({ code: "mort.diaria", name: "Mortalidade diária (%)", short: "Mortalidade", unit: "%", direction: "menor_melhor", aggregation: "razao", decimals: 3, group: G.mort, description: "Mortes ÷ aves × 100. Na semana: Σ mortes ÷ aves no início da semana × 100 (mortalidade semanal)." }),
  m({ code: "mort.acumulada", name: "Mortalidade acumulada (%)", short: "Mort. acumulada", unit: "%", direction: "menor_melhor", aggregation: "ultimo", decimals: 2, group: G.mort, description: "Σ mortes desde o alojamento ÷ aves alojadas × 100.", hasStrainStandard: true }),
  m({ code: "mort.viabilidade", name: "Viabilidade (%)", short: "Viabilidade", unit: "%", direction: "maior_melhor", aggregation: "ultimo", decimals: 2, group: G.mort, description: "Aves presentes ÷ aves alojadas × 100." }),
  m({ code: "mort.desvio_acumulada", name: "Desvio de mortalidade acumulada", short: "Desvio mort. acum.", unit: "p.p.", direction: "menor_melhor", aggregation: "ultimo", decimals: 2, group: G.mort, description: "Mortalidade acumulada − padrão da linhagem." }),
  m({ code: "mort.prolapso", name: "Mortes por prolapso", short: "Prolapso", unit: "aves", direction: "menor_melhor", aggregation: "soma", decimals: 0, group: G.mort, description: "Mortes com causa registrada prolapso." }),
  m({ code: "mort.calor", name: "Mortes por calor", short: "Mortes calor", unit: "aves", direction: "menor_melhor", aggregation: "soma", decimals: 0, group: G.mort, description: "Mortes com causa registrada calor.", internal: true }),

  // 6.4 Nutrição
  m({ code: "nut.racao", name: "Consumo de ração", short: "Ração", unit: "g/ave/dia", direction: "neutro", aggregation: "razao", decimals: 1, group: G.nut, description: "Ração (kg) × 1000 ÷ aves.", hasStrainStandard: true }),
  m({ code: "nut.agua", name: "Consumo de água", short: "Água", unit: "mL/ave/dia", direction: "neutro", aggregation: "razao", decimals: 1, group: G.nut, description: "Água (L) × 1000 ÷ aves.", hasStrainStandard: true }),
  m({ code: "nut.agua_racao", name: "Relação água:ração", short: "Água:ração", unit: "mL/g", direction: "neutro", aggregation: "razao", decimals: 2, group: G.nut, description: "mL de água ÷ g de ração." }),
  m({ code: "nut.conv_dz", name: "Conversão por dúzia", short: "Conv. dúzia", unit: "kg/dz", direction: "menor_melhor", aggregation: "razao", decimals: 3, group: G.nut, description: "Ração (kg) ÷ (ovos ÷ 12)." }),
  m({ code: "nut.conv_massa", name: "Conversão por massa", short: "Conv. massa", unit: "kg/kg", direction: "menor_melhor", aggregation: "razao", decimals: 2, group: G.nut, description: "Ração (kg) ÷ (ovos × peso do ovo ÷ 1000)." }),
  m({ code: "nut.peso_corporal", name: "Peso corporal", short: "Peso corporal", unit: "g", direction: "neutro", aggregation: "ultimo", decimals: 0, group: G.nut, description: "Média da última pesagem semanal.", hasStrainStandard: true }),
  m({ code: "nut.uniformidade", name: "Uniformidade", short: "Uniformidade", unit: "%", direction: "maior_melhor", aggregation: "ultimo", decimals: 1, group: G.nut, description: "% das aves dentro de ±10% da média (última pesagem)." }),

  // 6.5 Ambiência
  m({ code: "amb.temp_max", name: "Temperatura interna máxima", short: "Temp. máx.", unit: "°C", direction: "menor_melhor", aggregation: "max", decimals: 1, group: G.amb, description: "Maior temperatura interna horária do dia produtivo." }),
  m({ code: "amb.temp_min", name: "Temperatura interna mínima", short: "Temp. mín.", unit: "°C", direction: "neutro", aggregation: "min", decimals: 1, group: G.amb, description: "Menor temperatura interna horária do dia produtivo." }),
  m({ code: "amb.temp_media", name: "Temperatura interna média", short: "Temp. média", unit: "°C", direction: "neutro", aggregation: "media_ponderada", decimals: 1, group: G.amb, description: "Média das temperaturas internas horárias." }),
  m({ code: "amb.horas_30", name: "Horas acima de 30 °C", short: "h > 30 °C", unit: "h", direction: "menor_melhor", aggregation: "soma", decimals: 0, group: G.amb, description: "Horas com temperatura interna acima de 30 °C." }),
  m({ code: "amb.horas_32", name: "Horas acima de 32 °C", short: "h > 32 °C", unit: "h", direction: "menor_melhor", aggregation: "soma", decimals: 0, group: G.amb, description: "Horas com temperatura interna acima de 32 °C." }),
  m({ code: "amb.graus_hora_30", name: "Graus-hora acima de 30 °C", short: "°C·h > 30", unit: "°C·h", direction: "menor_melhor", aggregation: "soma", decimals: 1, group: G.amb, description: "Soma de (temperatura − 30) nas horas acima de 30 °C." }),
  m({ code: "amb.umidade", name: "Umidade relativa média", short: "Umidade", unit: "%", direction: "neutro", aggregation: "media_ponderada", decimals: 0, group: G.amb, description: "Umidade relativa interna média." }),
  m({ code: "amb.nh3_max", name: "Amônia máxima", short: "Amônia", unit: "ppm", direction: "menor_melhor", aggregation: "max", decimals: 1, group: G.amb, description: "Maior leitura horária de amônia (só últimos 60 dias)." }),
  m({ code: "amb.temp_ext_max", name: "Temperatura externa máxima", short: "Temp. ext. máx.", unit: "°C", direction: "neutro", aggregation: "max", decimals: 1, group: G.amb, description: "Maior temperatura externa do dia produtivo." }),
  m({ code: "amb.temp_noturna_max", name: "Máxima interna noturna (22h–05h)", short: "Máx. noturna", unit: "°C", direction: "menor_melhor", aggregation: "max", decimals: 1, group: G.amb, description: "Maior temperatura interna entre 22h e 05h." }),
  m({ code: "amb.delta_resfriamento", name: "Diferença de resfriamento", short: "Δ resfriamento", unit: "°C", direction: "maior_melhor", aggregation: "media_ponderada", decimals: 1, group: G.amb, description: "Temperatura externa máxima − interna máxima." }),

  // 6.6 Laboratório
  m({ code: "lab.resistencia", name: "Resistência da casca", short: "Resistência", unit: "kgf", direction: "maior_melhor", aggregation: "ultimo", decimals: 2, group: G.lab, description: "Média da última amostra de casca." }),
  m({ code: "lab.espessura", name: "Espessura da casca", short: "Espessura", unit: "mm", direction: "maior_melhor", aggregation: "ultimo", decimals: 3, group: G.lab, description: "Média da última amostra de casca." }),
  m({ code: "lab.gravidade", name: "Gravidade específica", short: "Gravidade", unit: "g/cm³", direction: "maior_melhor", aggregation: "ultimo", decimals: 4, group: G.lab, description: "Média da última amostra de casca." }),
  m({ code: "lab.haugh", name: "Unidade Haugh", short: "Haugh", unit: "UH", direction: "maior_melhor", aggregation: "ultimo", decimals: 1, group: G.lab, description: "Qualidade do albúmen na última amostra." }),
  m({ code: "lab.peso_ovo", name: "Peso do ovo (laboratório)", short: "Peso lab.", unit: "g", direction: "maior_melhor", aggregation: "ultimo", decimals: 1, group: G.lab, description: "Peso médio dos ovos da última amostra." }),

  // 6.7 Financeiro
  m({ code: "fin.receita", name: "Receita", short: "Receita", unit: "R$", direction: "maior_melhor", aggregation: "soma", decimals: 2, group: G.fin, description: "Receita estimada da venda dos ovos por destino.", finance: true }),
  m({ code: "fin.custo", name: "Custo total", short: "Custo", unit: "R$", direction: "menor_melhor", aggregation: "soma", decimals: 2, group: G.fin, description: "Soma dos custos estimados (ração, embalagem, overhead, fixos, ave, sanidade).", finance: true }),
  m({ code: "fin.margem", name: "Margem", short: "Margem", unit: "R$", direction: "maior_melhor", aggregation: "soma", decimals: 2, group: G.fin, description: "Receita − custo total (estimado).", finance: true }),
  m({ code: "fin.custo_dz", name: "Custo por dúzia", short: "Custo/dz", unit: "R$/dz", direction: "menor_melhor", aggregation: "razao", decimals: 2, group: G.fin, description: "Custo total ÷ (ovos ÷ 12).", finance: true }),
  m({ code: "fin.margem_dz", name: "Margem por dúzia", short: "Margem/dz", unit: "R$/dz", direction: "maior_melhor", aggregation: "razao", decimals: 2, group: G.fin, description: "Margem ÷ (ovos ÷ 12).", finance: true }),
  m({ code: "fin.margem_ave", name: "Margem por ave alojada", short: "Margem/ave", unit: "R$/ave", direction: "maior_melhor", aggregation: "razao", decimals: 3, group: G.fin, description: "Margem ÷ aves alojadas.", finance: true }),
  m({ code: "fin.postura_equilibrio", name: "Postura de equilíbrio", short: "Equilíbrio", unit: "%", direction: "menor_melhor", aggregation: "razao", decimals: 1, group: G.fin, description: "Postura mínima para a receita pagar os custos (sobre os totais do período).", finance: true }),

  // 6.8 Operação
  m({ code: "ops.completude", name: "Completude dos dados", short: "Completude", unit: "%", direction: "maior_melhor", aggregation: "razao", decimals: 1, group: G.ops, description: "Leituras recebidas ÷ esperadas por fonte e dia." }),
];

export const METRIC_BY_CODE: Record<string, MetricDef> = Object.fromEntries(METRICS.map((d) => [d.code, d]));

export function metricDef(code: string): MetricDef {
  const d = METRIC_BY_CODE[code];
  if (!d) throw new Error(`Métrica desconhecida: ${code}`);
  return d;
}

export function isFinanceMetric(code: string): boolean {
  return code.startsWith("fin.") || METRIC_BY_CODE[code]?.finance === true;
}

/** Métricas com curva da linhagem gravada em strain_standards (Parte 6.9). */
export const STRAIN_STANDARD_METRICS = [
  "prod.postura",
  "prod.oaa",
  "prod.peso_ovo",
  "prod.massa",
  "mort.acumulada",
  "nut.racao",
  "nut.agua",
  "nut.peso_corporal",
] as const;

/** Métricas do padrão interno (Parte 8.3). */
export const INTERNAL_STANDARD_METRICS = [
  "prod.postura",
  "mort.acumulada",
  "prod.peso_ovo",
  "nut.racao",
  "nut.agua",
  "qual.trincados",
  "qual.quebrados",
  "qual.sujos_fezes",
  "qual.sujos_sangue",
] as const;

/** Nomes comuns aceitos pelo assistente (Parte 13.2). */
export const METRIC_ALIASES: Record<string, string> = {
  postura: "prod.postura",
  "postura ave-dia": "prod.postura",
  producao: "prod.ovos",
  ovos: "prod.ovos",
  caixas: "prod.caixas",
  trincados: "qual.trincados",
  trinca: "qual.trincados",
  quebrados: "qual.quebrados",
  avarias: "qual.avarias",
  mortalidade: "mort.diaria",
  "mortalidade diaria": "mort.diaria",
  "mortalidade acumulada": "mort.acumulada",
  mortes: "mort.mortes",
  viabilidade: "mort.viabilidade",
  racao: "nut.racao",
  "consumo de racao": "nut.racao",
  agua: "nut.agua",
  "consumo de agua": "nut.agua",
  temperatura: "amb.temp_max",
  "temperatura maxima": "amb.temp_max",
  "temperatura externa": "amb.temp_ext_max",
  umidade: "amb.umidade",
  amonia: "amb.nh3_max",
  margem: "fin.margem",
  "margem por duzia": "fin.margem_dz",
  receita: "fin.receita",
  custo: "fin.custo",
  "sujos de fezes": "qual.sujos_fezes",
  sujos: "qual.sujos_fezes",
  sangue: "qual.sujos_sangue",
  "sujos de sangue": "qual.sujos_sangue",
  "peso do ovo": "prod.peso_ovo",
  "ovo por ave alojada": "prod.oaa",
  oaa: "prod.oaa",
  conversao: "nut.conv_dz",
  "peso corporal": "nut.peso_corporal",
  aproveitamento: "prod.aproveitamento",
  "postura de equilibrio": "fin.postura_equilibrio",
};
