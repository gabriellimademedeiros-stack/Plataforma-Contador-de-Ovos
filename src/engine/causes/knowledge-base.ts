/**
 * Base de conhecimento das hipóteses de causa (Parte 11.3).
 * FICTÍCIA E SIMPLIFICADA: precisa ser revisada por um veterinário antes de qualquer uso real.
 */
import type { AnomalyType } from "@/engine/alerts/rules";

export type SignalCode =
  | "TEMP_ALTA"
  | "CALOR_ANTES"
  | "RACAO_QUEDA"
  | "AGUA_QUEDA"
  | "AGUA_QUEDA_BRUSCA"
  | "AGUA_ANTECEDE"
  | "AGUA_ALTA"
  | "AGUA_ALTA_SEM_CALOR"
  | "MULTI_GALPOES"
  | "SO_ESTE_GALPAO"
  | "PIOR_QUE_VIZINHOS"
  | "RESFRIAMENTO_FRACO"
  | "UMA_PISTA"
  | "LOTE_JOVEM"
  | "LOTE_VELHO"
  | "PESO_OVO_SUBINDO"
  | "MORT_ALTA"
  | "MORT_PROLAPSO"
  | "MORT_CALOR"
  | "ABRUPTO"
  | "GRADUAL"
  | "CARGA_COMPARTILHADA"
  | "EVENTO_TROCA_RACAO"
  | "LAB_CASCA_PIOR"
  | "EVENTO_VACINA"
  | "EVENTO_ENERGIA"
  | "TEMP_NOTURNA"
  | "EVENTO_LUZ"
  | "NH3_ALTA"
  | "SINAIS_RESPIRATORIOS"
  | "DESPIGMENTACAO";

/** Categoria do alerta → "aplica a" da base. */
export type AppliesTo = "postura" | "racao" | "mortalidade" | "trincados" | "temperatura" | "sujos_fezes" | "agua" | "sujos_sangue";

export const ANOMALY_APPLIES: Record<AnomalyType, AppliesTo | null> = {
  postura_queda: "postura",
  mortalidade_alta: "mortalidade",
  agua_queda: "agua",
  racao_queda: "racao",
  temperatura_alta: "temperatura",
  trincados_alta: "trincados",
  sujos_fezes_alta: "sujos_fezes",
  sujos_sangue_alta: "sujos_sangue",
  margem_negativa: null,
  previsao_calor: null,
  esteira_sem_fluxo: "trincados",
};

export interface Hypothesis {
  code: string;
  name: string;
  appliesTo: AppliesTo[];
  favor: Partial<Record<SignalCode, number>>;
  against: Partial<Record<SignalCode, number>>;
  /** bônus de ordem (só estresse térmico: CALOR_ANTES +2) */
  orderBonus?: Partial<Record<SignalCode, number>>;
  checks: string[];
  /** tipos de evento que confirmam a hipótese (sinal EVENTO_CONFIRMADO) */
  confirmingEvents: string[];
}

export const KNOWLEDGE_BASE: Hypothesis[] = [
  { code: "estresse_termico", name: "Estresse térmico", appliesTo: ["postura", "racao", "mortalidade", "trincados", "temperatura", "sujos_fezes"], favor: { TEMP_ALTA: 3, RACAO_QUEDA: 2, AGUA_ALTA: 2, MULTI_GALPOES: 2, MORT_CALOR: 1 }, orderBonus: { CALOR_ANTES: 2 }, against: { AGUA_QUEDA: 2, SO_ESTE_GALPAO: 1, UMA_PISTA: 2 }, checks: ["Exaustores", "Nebulização e placas evaporativas", "Cortinas", "Água fresca", "Ração nas horas mais frescas"], confirmingEvents: ["ambiente.onda_calor"] },
  { code: "resfriamento_insuficiente", name: "Resfriamento insuficiente neste galpão", appliesTo: ["temperatura", "postura", "mortalidade"], favor: { RESFRIAMENTO_FRACO: 3, PIOR_QUE_VIZINHOS: 2, TEMP_ALTA: 1 }, against: {}, checks: ["Exaustores parados", "Placas secas ou sujas", "Bomba de nebulização", "Vedação"], confirmingEvents: [] },
  { code: "doenca_infecciosa", name: "Doença infecciosa (ex.: respiratória)", appliesTo: ["postura", "agua", "racao", "mortalidade", "trincados"], favor: { AGUA_ANTECEDE: 3, AGUA_QUEDA: 2, SO_ESTE_GALPAO: 2, SINAIS_RESPIRATORIOS: 3, MORT_ALTA: 1, LAB_CASCA_PIOR: 1 }, against: { TEMP_ALTA: 2, MULTI_GALPOES: 2, AGUA_ALTA: 2, AGUA_QUEDA_BRUSCA: 1 }, checks: ["Chamar o veterinário", "Observar sinais respiratórios e fezes", "Coletar amostras", "Separar ovos deformados"], confirmingEvents: ["sanitario.doenca"] },
  { code: "falha_agua", name: "Falha de bebedouro ou abastecimento", appliesTo: ["agua", "racao", "postura"], favor: { AGUA_QUEDA_BRUSCA: 4, SO_ESTE_GALPAO: 2, RACAO_QUEDA: 1, ABRUPTO: 1 }, against: { MULTI_GALPOES: 2, TEMP_ALTA: 1 }, checks: ["Pressão na linha", "Filtros", "Registros", "Caixa d'água", "Bicos entupidos"], confirmingEvents: ["estrutura.manutencao_bebedouro", "ambiente.falta_agua"] },
  { code: "problema_racao", name: "Problema na ração (carga ou formulação)", appliesTo: ["racao", "postura"], favor: { CARGA_COMPARTILHADA: 3, EVENTO_TROCA_RACAO: 2, RACAO_QUEDA: 1 }, against: { TEMP_ALTA: 1, SO_ESTE_GALPAO: 1 }, checks: ["Conferir a carga", "Amostra para laboratório", "Comparar galpões que receberam a mesma carga"], confirmingEvents: ["manejo.troca_racao"] },
  { code: "falha_distribuicao_racao", name: "Falha na distribuição de ração", appliesTo: ["racao"], favor: { SO_ESTE_GALPAO: 2, ABRUPTO: 2, RACAO_QUEDA: 2 }, against: { TEMP_ALTA: 2, MULTI_GALPOES: 2 }, checks: ["Comedouros", "Carrinho ou corrente", "Silo travado"], confirmingEvents: [] },
  { code: "nutricional_casca", name: "Cálcio, fósforo ou vitamina D (casca)", appliesTo: ["trincados"], favor: { CARGA_COMPARTILHADA: 3, LAB_CASCA_PIOR: 3, GRADUAL: 1 }, against: { UMA_PISTA: 3, TEMP_ALTA: 1 }, checks: ["Análise da ração (cálcio, fósforo)", "Granulometria do calcário", "Laboratório de casca"], confirmingEvents: [] },
  { code: "idade_lote", name: "Idade do lote", appliesTo: ["trincados", "postura"], favor: { LOTE_VELHO: 2, GRADUAL: 2 }, against: { ABRUPTO: 2, UMA_PISTA: 2, LOTE_JOVEM: 3 }, checks: ["Programa de descarte", "Suporte nutricional para casca"], confirmingEvents: [] },
  { code: "equipamento_esteira", name: "Equipamento de coleta", appliesTo: ["trincados", "sujos_fezes"], favor: { UMA_PISTA: 4, ABRUPTO: 1, SO_ESTE_GALPAO: 1 }, against: { LAB_CASCA_PIOR: 2, MULTI_GALPOES: 2, AGUA_ALTA_SEM_CALOR: 1, NH3_ALTA: 1 }, checks: ["Esteira da pista indicada", "Transições", "Velocidade", "Elevador", "Frequência de coleta"], confirmingEvents: ["estrutura.manutencao_esteira"] },
  { code: "ovos_grandes_prolapso", name: "Ovos grandes no início da postura / prolapso", appliesTo: ["sujos_sangue", "mortalidade"], favor: { LOTE_JOVEM: 3, PESO_OVO_SUBINDO: 2, MORT_PROLAPSO: 3 }, against: { LOTE_VELHO: 3 }, checks: ["Intensidade e programa de luz", "Peso corporal × curva", "Observar cloacas"], confirmingEvents: ["sanitario.prolapso"] },
  { code: "bicagem", name: "Bicagem ou canibalismo", appliesTo: ["sujos_sangue", "mortalidade"], favor: { MORT_ALTA: 1, EVENTO_LUZ: 1, SO_ESTE_GALPAO: 1 }, against: {}, checks: ["Intensidade de luz", "Debicagem", "Densidade"], confirmingEvents: [] },
  { code: "acaro_vermelho", name: "Ácaro vermelho", appliesTo: ["sujos_sangue"], favor: { GRADUAL: 2, SO_ESTE_GALPAO: 1, LOTE_VELHO: 1 }, against: { LOTE_JOVEM: 1, ABRUPTO: 2 }, checks: ["Inspeção noturna das gaiolas", "Armadilhas"], confirmingEvents: [] },
  { code: "enterite", name: "Enterite ou diarreia", appliesTo: ["sujos_fezes"], favor: { MORT_ALTA: 2, AGUA_ALTA_SEM_CALOR: 1, SO_ESTE_GALPAO: 1, NH3_ALTA: 1 }, against: { UMA_PISTA: 2, TEMP_ALTA: 1 }, checks: ["Consistência das fezes", "Necropsia", "Veterinário"], confirmingEvents: [] },
  { code: "excesso_sodio", name: "Excesso de sódio ou minerais na ração", appliesTo: ["sujos_fezes"], favor: { CARGA_COMPARTILHADA: 3, AGUA_ALTA_SEM_CALOR: 2 }, against: { SO_ESTE_GALPAO: 1, UMA_PISTA: 2 }, checks: ["Análise da ração", "Sal na formulação"], confirmingEvents: [] },
  { code: "vazamento_bebedouro", name: "Vazamento de bebedouro ou excesso de água", appliesTo: ["sujos_fezes"], favor: { AGUA_ALTA_SEM_CALOR: 3, UMA_PISTA: 2, SO_ESTE_GALPAO: 2, NH3_ALTA: 1 }, against: { MULTI_GALPOES: 2, MORT_ALTA: 1 }, checks: ["Bicos pingando", "Pressão da linha", "Umidade das fezes por linha"], confirmingEvents: [] },
  { code: "falha_energia_ventilacao", name: "Falha de energia ou ventilação", appliesTo: ["mortalidade", "temperatura", "postura"], favor: { EVENTO_ENERGIA: 4, TEMP_NOTURNA: 3, SO_ESTE_GALPAO: 1, MORT_CALOR: 1 }, against: { MULTI_GALPOES: 1 }, checks: ["Gerador", "Alarmes", "Quadro elétrico", "Exaustores"], confirmingEvents: ["ambiente.queda_energia"] },
  { code: "programa_luz", name: "Programa de luz", appliesTo: ["postura", "sujos_sangue"], favor: { EVENTO_LUZ: 3, GRADUAL: 1 }, against: { MULTI_GALPOES: 1 }, checks: ["Timer", "Lâmpadas", "Intensidade"], confirmingEvents: ["manejo.programa_luz"] },
  { code: "estresse_manejo", name: "Estresse de manejo (vacinação, transferência)", appliesTo: ["postura", "racao", "agua"], favor: { EVENTO_VACINA: 3, SO_ESTE_GALPAO: 1, ABRUPTO: 1 }, against: { TEMP_ALTA: 1 }, checks: ["Acompanhar de 5 a 7 dias; costuma ser passageiro"], confirmingEvents: ["sanitario.vacinacao", "manejo.transferencia"] },
];

export const HYPOTHESIS_BY_CODE: Record<string, Hypothesis> = Object.fromEntries(KNOWLEDGE_BASE.map((h) => [h.code, h]));

export const EXTRA_CAUSES = [
  { code: "variacao_normal", name: "Variação normal" },
  { code: "desconhecida", name: "Causa desconhecida" },
  { code: "outra", name: "Outra (descrever)" },
];

export function causeName(code: string | null | undefined): string {
  if (!code) return "—";
  return HYPOTHESIS_BY_CODE[code]?.name ?? EXTRA_CAUSES.find((c) => c.code === code)?.name ?? code;
}

/** Perguntas para "o que falta saber" a partir de sinais não verificáveis (Parte 11.4). */
export const MISSING_QUESTIONS: Partial<Record<SignalCode, string>> = {
  SINAIS_RESPIRATORIOS: "Há aves com sinais respiratórios?",
  DESPIGMENTACAO: "Os ovos estão mais claros ou deformados?",
  NH3_ALTA: "Como está o cheiro de amônia?",
  LAB_CASCA_PIOR: "Há amostra recente de casca no laboratório?",
  CARGA_COMPARTILHADA: "A ração deste galpão veio de uma carga diferente das demais?",
  UMA_PISTA: "Os defeitos estão concentrados numa pista?",
  PESO_OVO_SUBINDO: "O peso do ovo está acima da curva?",
  EVENTO_ENERGIA: "Houve queda de energia ou de ventilação?",
  TEMP_NOTURNA: "A temperatura subiu durante a noite?",
};
