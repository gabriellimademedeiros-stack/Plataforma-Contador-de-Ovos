/** Registro das 11 ferramentas no formato do Vercel AI SDK (Parte 13.2). */
import "server-only";
import * as core from "./core";
import type { ToolContext } from "./core";

export const TOOL_DEFS = {
  consultar_indicador: { description: "Série diária ou semanal de um indicador por galpão e da granja, com resumo e referências (linhagem, padrão interno ou meta).", inputSchema: core.consultarIndicadorInput, run: core.consultarIndicador },
  comparar: { description: "Compara galpões, lotes (por semana de idade), linhagens ou períodos numa métrica, com tabela de n, média e diferença.", inputSchema: core.compararInput, run: core.comparar },
  listar_eventos: { description: "Eventos registrados (sanitários, manejo, ambiente, estrutura) com o resumo do retrato de impacto.", inputSchema: core.listarEventosInput, run: core.listarEventos },
  listar_alertas: { description: "Alertas com título, severidade, situação, datas e hipótese principal.", inputSchema: core.listarAlertasInput, run: core.listarAlertas },
  explicar_anomalia: { description: "Hipóteses de causa de um alerta (nota, confiança, sinais a favor e contra), decomposição do desvio e o que falta saber.", inputSchema: core.explicarAnomaliaInput, run: core.explicarAnomalia },
  casos_parecidos: { description: "Casos parecidos do histórico (impressão digital) para um alerta ou evento.", inputSchema: core.casosParecidosInput, run: core.casosParecidos },
  prever_producao: { description: "Previsão de ovos e caixas por semana (1 a 8 semanas), com faixa de incerteza.", inputSchema: core.preverProducaoInput, run: core.preverProducao },
  simular_financeiro: { description: "Cenário de preços (preço do ovo, variação %, preço da ração) ou projeção de descarte de um lote (margem de contribuição semanal e semana recomendada).", inputSchema: core.simularFinanceiroInput, run: core.simularFinanceiro },
  gerar_grafico: { description: "Gera a especificação de um gráfico (até 4 métricas, até 8 galpões) com os dados embutidos; várias métricas viram painel sincronizado.", inputSchema: core.gerarGraficoInput, run: core.gerarGrafico },
  preparar_evento: { description: "Prepara um RASCUNHO de evento; o registro só acontece quando o usuário confirmar no cartão.", inputSchema: core.prepararEventoInput, run: core.prepararEvento },
  buscar_conhecimento: { description: "Busca no glossário, nas definições de métrica, na base de hipóteses (o que verificar), nas metas e na memória da empresa.", inputSchema: core.buscarConhecimentoInput, run: core.buscarConhecimento },
} as const;

export type ToolName = keyof typeof TOOL_DEFS;

/** Executa uma ferramenta capturando erros como resposta (o modelo vê a mensagem de erro em português). */
export async function runTool(ctx: ToolContext, name: ToolName, input: unknown): Promise<Record<string, unknown>> {
  const def = TOOL_DEFS[name];
  try {
    const parsed = def.inputSchema.parse(input ?? {});
    return (await (def.run as (c: ToolContext, i: unknown) => Promise<Record<string, unknown>>)(ctx, parsed)) as Record<string, unknown>;
  } catch (e) {
    const msg = e instanceof core.ToolError ? e.message : e instanceof Error && "issues" in e ? `Parâmetros inválidos: ${(e as unknown as { issues: Array<{ path: unknown[]; message: string }> }).issues.map((x) => `${x.path.join(".") || "entrada"} (${x.message})`).join("; ").slice(0, 300)}` : "Falha ao consultar os dados.";
    if (!(e instanceof core.ToolError)) console.error(e);
    return { erro: msg, avisos: [] };
  }
}
