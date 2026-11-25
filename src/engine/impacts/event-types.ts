/** Tipos de evento (Parte 9.1). Semeados em `event_types`. */

export type EventCategory = "sanitario" | "manejo" | "ambiente" | "estrutura" | "detectado" | "outro";

export interface FieldDef {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "multiselect";
  options?: string[];
  unit?: string;
}

export interface EventTypeDef {
  code: string;
  category: EventCategory;
  name: string;
  baseDays: number;
  effectDays: number;
  /** Onda de calor: efeito = duração + 7 dias. */
  effectPlusDuration?: boolean;
  recoveryDays: number;
  fields: FieldDef[];
  icon: string;
}

export const CLINICAL_SIGNS = [
  "queda de postura",
  "ovo deformado",
  "casca fina",
  "despigmentação",
  "diarreia",
  "sinais respiratórios",
  "mortalidade",
];

export const EVENT_TYPES: EventTypeDef[] = [
  {
    code: "sanitario.doenca",
    category: "sanitario",
    name: "Doença (suspeita ou confirmada)",
    baseDays: 14,
    effectDays: 28,
    recoveryDays: 56,
    icon: "biohazard",
    fields: [
      { key: "agente", label: "Agente", type: "text" },
      {
        key: "metodo_diagnostico",
        label: "Método de diagnóstico",
        type: "select",
        options: ["clínico", "sorologia", "PCR", "necropsia", "outro"],
      },
      { key: "aves_afetadas", label: "Aves afetadas", type: "number" },
      { key: "sinais_clinicos", label: "Sinais clínicos", type: "multiselect", options: CLINICAL_SIGNS },
    ],
  },
  {
    code: "sanitario.vacinacao",
    category: "sanitario",
    name: "Vacinação",
    baseDays: 7,
    effectDays: 10,
    recoveryDays: 0,
    icon: "syringe",
    fields: [
      { key: "vacina", label: "Vacina", type: "text" },
      { key: "via", label: "Via", type: "select", options: ["água", "spray", "injetável", "ocular"] },
      { key: "partida", label: "Partida", type: "text" },
    ],
  },
  {
    code: "sanitario.medicacao",
    category: "sanitario",
    name: "Medicação",
    baseDays: 7,
    effectDays: 14,
    recoveryDays: 0,
    icon: "pill",
    fields: [
      { key: "principio_ativo", label: "Princípio ativo", type: "text" },
      { key: "dose", label: "Dose", type: "text" },
      { key: "via", label: "Via", type: "select", options: ["água", "ração", "injetável"] },
      { key: "carencia_dias", label: "Carência para ovos", type: "number", unit: "dias" },
    ],
  },
  { code: "sanitario.prolapso", category: "sanitario", name: "Aumento de prolapso", baseDays: 14, effectDays: 21, recoveryDays: 28, icon: "alert-triangle", fields: [] },
  { code: "sanitario.necropsia", category: "sanitario", name: "Necropsia", baseDays: 0, effectDays: 0, recoveryDays: 0, icon: "microscope", fields: [] },
  {
    code: "manejo.troca_racao",
    category: "manejo",
    name: "Troca de ração ou de fase",
    baseDays: 14,
    effectDays: 21,
    recoveryDays: 28,
    icon: "wheat",
    fields: [
      { key: "formulacao_anterior", label: "Formulação anterior", type: "text" },
      { key: "formulacao_nova", label: "Nova formulação", type: "text" },
      { key: "motivo", label: "Motivo", type: "text" },
    ],
  },
  {
    code: "manejo.programa_luz",
    category: "manejo",
    name: "Mudança no programa de luz",
    baseDays: 14,
    effectDays: 28,
    recoveryDays: 0,
    icon: "lightbulb",
    fields: [
      { key: "horas_antes", label: "Horas de luz antes", type: "number", unit: "h" },
      { key: "horas_depois", label: "Horas de luz depois", type: "number", unit: "h" },
      { key: "intensidade", label: "Intensidade", type: "text" },
    ],
  },
  { code: "manejo.transferencia", category: "manejo", name: "Transferência ou alojamento", baseDays: 7, effectDays: 14, recoveryDays: 0, icon: "truck", fields: [] },
  { code: "ambiente.onda_calor", category: "ambiente", name: "Onda de calor", baseDays: 7, effectDays: 7, effectPlusDuration: true, recoveryDays: 21, icon: "thermometer-sun", fields: [] },
  { code: "ambiente.queda_energia", category: "ambiente", name: "Queda de energia", baseDays: 2, effectDays: 3, recoveryDays: 7, icon: "zap-off", fields: [] },
  { code: "ambiente.falta_agua", category: "ambiente", name: "Falta de água", baseDays: 2, effectDays: 5, recoveryDays: 10, icon: "droplet-off", fields: [] },
  { code: "estrutura.manutencao_bebedouro", category: "estrutura", name: "Falha ou manutenção de bebedouro", baseDays: 2, effectDays: 3, recoveryDays: 7, icon: "droplets", fields: [] },
  { code: "estrutura.manutencao_esteira", category: "estrutura", name: "Falha ou manutenção de esteira", baseDays: 7, effectDays: 7, recoveryDays: 7, icon: "wrench", fields: [] },
  { code: "estrutura.falha_contador", category: "estrutura", name: "Falha do contador", baseDays: 0, effectDays: 0, recoveryDays: 0, icon: "camera-off", fields: [] },
  { code: "detectado.nao_explicado", category: "detectado", name: "Anomalia sem causa registrada", baseDays: 7, effectDays: 7, recoveryDays: 0, icon: "help-circle", fields: [] },
  { code: "outro", category: "outro", name: "Outro", baseDays: 7, effectDays: 14, recoveryDays: 0, icon: "circle", fields: [] },
];

export const EVENT_TYPE_BY_CODE: Record<string, EventTypeDef> = Object.fromEntries(EVENT_TYPES.map((t) => [t.code, t]));

export const CATEGORY_LABEL: Record<EventCategory, string> = {
  sanitario: "Sanitário",
  manejo: "Manejo",
  ambiente: "Ambiente",
  estrutura: "Estrutura",
  detectado: "Detectado",
  outro: "Outro",
};

export const CERTAINTY_LABEL: Record<string, string> = {
  suspeito: "Suspeito",
  provavel: "Provável",
  confirmado: "Confirmado",
  descartado: "Descartado",
};

export const SEVERITY_LABEL: Record<string, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  critica: "Crítica",
  aviso: "Aviso",
};

/** Duração do efeito em dias para um evento concreto (onda de calor soma a duração). */
export function effectDaysFor(def: EventTypeDef, durationDays: number): number {
  return def.effectPlusDuration ? durationDays + def.effectDays : def.effectDays;
}
