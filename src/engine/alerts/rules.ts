/** Regras de alerta (Parte 10.1 e 16.1). Parâmetros semeados em `alert_rules.params`, editáveis. */

export type AnomalyType =
  | "postura_queda"
  | "mortalidade_alta"
  | "agua_queda"
  | "racao_queda"
  | "temperatura_alta"
  | "trincados_alta"
  | "sujos_fezes_alta"
  | "sujos_sangue_alta"
  | "margem_negativa"
  | "previsao_calor"
  | "esteira_sem_fluxo";

export interface RuleDef {
  code: string;
  name: string;
  description: string;
  anomalyType: AnomalyType;
  severity: "media" | "alta" | "aviso";
  metric: string | null;
  kind: "diaria" | "semanal" | "preventiva" | "tempo_real";
  params: Record<string, number>;
}

export const RULES: RuleDef[] = [
  {
    code: "A03",
    name: "Queda súbita de postura",
    description: "Postura do dia ≤ média dos 7 dias anteriores − 3,0 p.p. por 2 dias seguidos.",
    anomalyType: "postura_queda",
    severity: "alta",
    metric: "prod.postura",
    kind: "diaria",
    params: { drop_pp: 3.0, base_days: 7, persistence: 2, normal_pp: 1.5, normal_days: 2, min_age_weeks: 20, min_valid: 5 },
  },
  {
    code: "A04",
    name: "Postura semanal abaixo do padrão",
    description: "Postura da semana completa abaixo da mediana do padrão interno − 2,0 p.p. (ou curva da linhagem − 3,0 p.p. se o padrão interno tiver menos de 3 lotes). Avaliada no domingo.",
    anomalyType: "postura_queda",
    severity: "media",
    metric: "prod.postura",
    kind: "semanal",
    params: { internal_pp: 2.0, strain_pp: 3.0, min_flocks: 3, min_age_weeks: 26 },
  },
  {
    code: "A05",
    name: "Queda lenta de postura",
    description: "CUSUM dos resíduos da postura contra o esperado (com calor) passa de 4.",
    anomalyType: "postura_queda",
    severity: "media",
    metric: "prod.postura",
    kind: "diaria",
    params: { k: 0.5, h: 4, resid_days: 56, min_sd: 0.5, min_age_weeks: 26 },
  },
  {
    code: "A06",
    name: "Mortalidade fora do normal",
    description: "Mortalidade do dia acima de 3 × a mediana dos 14 dias anteriores e acima de 0,05%. Crítica acima de 0,20%.",
    anomalyType: "mortalidade_alta",
    severity: "alta",
    metric: "mort.diaria",
    kind: "diaria",
    params: { factor: 3, min_pct: 0.05, critical_pct: 0.2, median_days: 14, persistence: 1, normal_factor: 2, normal_days: 2, min_valid: 5 },
  },
  {
    code: "A08",
    name: "Queda de consumo de água",
    description: "Água do dia ≤ 90% da média dos 7 dias anteriores.",
    anomalyType: "agua_queda",
    severity: "alta",
    metric: "nut.agua",
    kind: "diaria",
    params: { ratio: 0.9, base_days: 7, persistence: 1, normal_ratio: 0.95, normal_days: 2, min_valid: 5 },
  },
  {
    code: "A09",
    name: "Queda de consumo de ração",
    description: "Ração do dia ≤ 93% da média dos 7 dias anteriores, por 2 dias seguidos.",
    anomalyType: "racao_queda",
    severity: "media",
    metric: "nut.racao",
    kind: "diaria",
    params: { ratio: 0.93, base_days: 7, persistence: 2, normal_ratio: 0.97, normal_days: 2, min_valid: 5 },
  },
  {
    code: "A11",
    name: "Temperatura interna alta",
    description: "2 horas ou mais acima de 32 °C no dia, ou qualquer hora acima de 35 °C (crítica).",
    anomalyType: "temperatura_alta",
    severity: "alta",
    metric: "amb.temp_max",
    kind: "diaria",
    params: { hours_threshold: 32, min_hours: 2, critical_temp: 35, persistence: 1, normal_days: 2 },
  },
  {
    code: "A14",
    name: "Aumento de trincados",
    description: "Trincados ≥ 1,4 × mediana dos 14 dias anteriores e pelo menos 0,5 p.p. acima, por 2 dias seguidos.",
    anomalyType: "trincados_alta",
    severity: "media",
    metric: "qual.trincados",
    kind: "diaria",
    params: { factor: 1.4, min_add_pp: 0.5, median_days: 14, persistence: 2, normal_factor: 1.15, normal_days: 2, min_age_weeks: 20, min_valid: 5 },
  },
  {
    code: "A15",
    name: "Avarias concentradas numa pista",
    description: "Razão entre as pistas das avarias ≥ 2,0 (com pelo menos 500 ovos em cada pista), por 2 dias seguidos.",
    anomalyType: "trincados_alta",
    severity: "media",
    metric: "qual.razao_pistas",
    kind: "diaria",
    params: { ratio: 2.0, min_eggs_lane: 500, persistence: 2, normal_ratio: 1.4, normal_days: 2, min_age_weeks: 20 },
  },
  {
    code: "A16",
    name: "Aumento de sujos de fezes",
    description: "Sujos de fezes ≥ 1,4 × mediana dos 14 dias anteriores e pelo menos 0,4 p.p. acima, por 2 dias seguidos.",
    anomalyType: "sujos_fezes_alta",
    severity: "media",
    metric: "qual.sujos_fezes",
    kind: "diaria",
    params: { factor: 1.4, min_add_pp: 0.4, median_days: 14, persistence: 2, normal_factor: 1.15, normal_days: 2, min_age_weeks: 20, min_valid: 5 },
  },
  {
    code: "A17",
    name: "Aumento de sujos de sangue",
    description: "Sujos de sangue ≥ 2,0 × mediana dos 14 dias anteriores e pelo menos 0,2 p.p. acima, por 2 dias seguidos.",
    anomalyType: "sujos_sangue_alta",
    severity: "media",
    metric: "qual.sujos_sangue",
    kind: "diaria",
    params: { factor: 2.0, min_add_pp: 0.2, median_days: 14, persistence: 2, normal_factor: 1.3, normal_days: 2, min_age_weeks: 20, min_valid: 5 },
  },
  {
    code: "A22",
    name: "Margem semanal negativa",
    description: "Margem da semana completa abaixo de zero por 3 semanas seguidas.",
    anomalyType: "margem_negativa",
    severity: "media",
    metric: "fin.margem",
    kind: "semanal",
    params: { weeks: 3 },
  },
  {
    code: "P01",
    name: "Previsão de calor",
    description: "Previsão de máxima externa ≥ 36 °C nos próximos 3 dias: aviso preventivo com os galpões de maior risco.",
    anomalyType: "previsao_calor",
    severity: "aviso",
    metric: "amb.temp_ext_max",
    kind: "preventiva",
    params: { temp: 36, days_ahead: 3 },
  },
  {
    code: "A02",
    name: "Esteira sem fluxo",
    description: "Galpão com mensagens do contador por minuto nas últimas 2 horas e nenhum ovo há 20 minutos ou mais, entre 06h e 16h.",
    anomalyType: "esteira_sem_fluxo",
    severity: "alta",
    metric: "prod.ovos",
    kind: "tempo_real",
    params: { lookback_min: 120, no_eggs_min: 20, start_hour: 6, end_hour: 16 },
  },
  {
    code: "A08h",
    name: "Queda de água no dia",
    description: "Água acumulada desde as 06h ≤ 85% da média das mesmas horas nos 7 dias anteriores (com pelo menos 3 horas de dados).",
    anomalyType: "agua_queda",
    severity: "alta",
    metric: "nut.agua",
    kind: "tempo_real",
    params: { ratio: 0.85, base_days: 7, min_hours: 3 },
  },
];

export const RULE_BY_CODE: Record<string, RuleDef> = Object.fromEntries(RULES.map((r) => [r.code, r]));

/** Regras que geram anomalia sem causa e pergunta ao encarregado (Parte 9.7). */
export const QUESTION_RULES = ["A03", "A06", "A08", "A09", "A14", "A16", "A17"];
