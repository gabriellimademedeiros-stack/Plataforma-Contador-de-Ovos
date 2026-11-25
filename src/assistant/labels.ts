/** Rótulos das ferramentas para o progresso no chat (sem dependências de servidor). */
import { METRIC_BY_CODE } from "@/engine/metrics/catalog";

const metricName = (m: string) => (METRIC_BY_CODE[m] ? METRIC_BY_CODE[m].name.replace(/ \(.*\)$/, "").toLowerCase() : m);
/** Rótulo em linguagem simples para o progresso das ferramentas (Parte 13.4). */
export function toolLabel(name: string, input: Record<string, unknown> = {}): string {
  const g = Array.isArray(input.galpoes) ? ` do ${(input.galpoes as string[]).join(", ")}` : input.galpao ? ` do ${input.galpao}` : "";
  const m = input.metrica ? metricName(String(input.metrica)) : Array.isArray(input.metricas) ? (input.metricas as string[]).map(metricName).join(", ") : "";
  switch (name) {
    case "consultar_indicador":
      return `Consultando ${m}${g}…`;
    case "comparar":
      return `Comparando ${m}…`;
    case "listar_eventos":
      return `Listando eventos${g}…`;
    case "listar_alertas":
      return `Listando alertas${g}…`;
    case "explicar_anomalia":
      return `Analisando causas prováveis${g}…`;
    case "casos_parecidos":
      return "Procurando casos parecidos no histórico…";
    case "prever_producao":
      return "Calculando a previsão de produção…";
    case "simular_financeiro":
      return input.modo === "descarte" ? "Projetando a decisão de descarte…" : "Simulando cenário de preços…";
    case "gerar_grafico":
      return `Montando o gráfico de ${m}${g}…`;
    case "preparar_evento":
      return "Preparando o rascunho do evento…";
    case "buscar_conhecimento":
      return "Buscando na base de conhecimento…";
    default:
      return "Trabalhando…";
  }
}
