/** Pergunta da plataforma ao encarregado quando há anomalia sem causa registrada (Parte 9.7). */
export interface QuestionOption {
  code: string;
  label: string;
  hypothesis: string | null;
  eventType: string | null;
}

const Q: Record<string, { text: (h: string) => string; options: QuestionOption[] }> = {
  sujos_fezes_alta: {
    text: (h) => `Os ovos sujos de fezes aumentaram no ${h}. O que você observou no galpão?`,
    options: [
      { code: "vazamento_bebedouro", label: "Vazamento de bebedouro", hypothesis: "vazamento_bebedouro", eventType: "estrutura.manutencao_bebedouro" },
      { code: "enterite", label: "Fezes moles / diarreia", hypothesis: "enterite", eventType: "sanitario.doenca" },
      { code: "equipamento_esteira", label: "Problema na esteira de esterco", hypothesis: "equipamento_esteira", eventType: "estrutura.manutencao_esteira" },
      { code: "excesso_sodio", label: "Ração diferente", hypothesis: "excesso_sodio", eventType: "manejo.troca_racao" },
      { code: "estresse_termico", label: "Calor", hypothesis: "estresse_termico", eventType: "ambiente.onda_calor" },
      { code: "nao_sei", label: "Não sei", hypothesis: null, eventType: null },
    ],
  },
  trincados_alta: {
    text: (h) => `Os ovos trincados aumentaram no ${h}. O que pode ser?`,
    options: [
      { code: "equipamento_esteira", label: "Problema na esteira ou na coleta", hypothesis: "equipamento_esteira", eventType: "estrutura.manutencao_esteira" },
      { code: "nutricional_casca", label: "Ração diferente", hypothesis: "nutricional_casca", eventType: "manejo.troca_racao" },
      { code: "estresse_termico", label: "Calor", hypothesis: "estresse_termico", eventType: "ambiente.onda_calor" },
      { code: "idade_lote", label: "Lote velho", hypothesis: "idade_lote", eventType: null },
      { code: "nao_sei", label: "Não sei", hypothesis: null, eventType: null },
    ],
  },
  agua_queda: {
    text: (h) => `O consumo de água caiu no ${h}. O que aconteceu?`,
    options: [
      { code: "falha_agua", label: "Bebedouro, registro ou falta de água", hypothesis: "falha_agua", eventType: "estrutura.manutencao_bebedouro" },
      { code: "doenca_infecciosa", label: "Aves doentes ou paradas", hypothesis: "doenca_infecciosa", eventType: "sanitario.doenca" },
      { code: "nao_sei", label: "Não sei", hypothesis: null, eventType: null },
    ],
  },
  postura_queda: {
    text: (h) => `A postura caiu no ${h}. O que pode ter acontecido?`,
    options: [
      { code: "estresse_termico", label: "Calor", hypothesis: "estresse_termico", eventType: "ambiente.onda_calor" },
      { code: "doenca_infecciosa", label: "Aves doentes", hypothesis: "doenca_infecciosa", eventType: "sanitario.doenca" },
      { code: "falha_agua", label: "Falta de água", hypothesis: "falha_agua", eventType: "ambiente.falta_agua" },
      { code: "problema_racao", label: "Ração diferente", hypothesis: "problema_racao", eventType: "manejo.troca_racao" },
      { code: "estresse_manejo", label: "Vacinação ou manejo", hypothesis: "estresse_manejo", eventType: "sanitario.vacinacao" },
      { code: "programa_luz", label: "Problema de luz", hypothesis: "programa_luz", eventType: "manejo.programa_luz" },
      { code: "nao_sei", label: "Não sei", hypothesis: null, eventType: null },
    ],
  },
  mortalidade_alta: {
    text: (h) => `A mortalidade subiu no ${h}. O que você viu?`,
    options: [
      { code: "estresse_termico", label: "Calor", hypothesis: "estresse_termico", eventType: "ambiente.onda_calor" },
      { code: "ovos_grandes_prolapso", label: "Prolapso ou bicagem", hypothesis: "ovos_grandes_prolapso", eventType: "sanitario.prolapso" },
      { code: "doenca_infecciosa", label: "Doença", hypothesis: "doenca_infecciosa", eventType: "sanitario.doenca" },
      { code: "falha_energia_ventilacao", label: "Falta de energia ou ventilação", hypothesis: "falha_energia_ventilacao", eventType: "ambiente.queda_energia" },
      { code: "nao_sei", label: "Não sei", hypothesis: null, eventType: null },
    ],
  },
  sujos_sangue_alta: {
    text: (h) => `Os ovos sujos de sangue aumentaram no ${h}. O que pode ser?`,
    options: [
      { code: "ovos_grandes_prolapso", label: "Prolapso ou ovos grandes", hypothesis: "ovos_grandes_prolapso", eventType: "sanitario.prolapso" },
      { code: "bicagem", label: "Bicagem", hypothesis: "bicagem", eventType: "outro" },
      { code: "acaro_vermelho", label: "Ácaro", hypothesis: "acaro_vermelho", eventType: "outro" },
      { code: "nao_sei", label: "Não sei", hypothesis: null, eventType: null },
    ],
  },
  racao_queda: {
    text: (h) => `O consumo de ração caiu no ${h}. O que aconteceu?`,
    options: [
      { code: "estresse_termico", label: "Calor", hypothesis: "estresse_termico", eventType: "ambiente.onda_calor" },
      { code: "falha_distribuicao_racao", label: "Comedouro ou distribuição", hypothesis: "falha_distribuicao_racao", eventType: "outro" },
      { code: "doenca_infecciosa", label: "Aves doentes", hypothesis: "doenca_infecciosa", eventType: "sanitario.doenca" },
      { code: "problema_racao", label: "Ração diferente", hypothesis: "problema_racao", eventType: "manejo.troca_racao" },
      { code: "nao_sei", label: "Não sei", hypothesis: null, eventType: null },
    ],
  },
};

export function questionFor(anomalyType: string, house: string) {
  const q = Q[anomalyType];
  if (!q) return null;
  return { question: q.text(house), options: q.options };
}
