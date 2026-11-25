/**
 * Modo reserva (Parte 13.6): sem chave de IA, reconhece as 12 perguntas sugeridas e variações próximas,
 * CHAMA AS MESMAS FERRAMENTAS e monta a resposta por modelos de texto. Os números são sempre reais.
 */
import "server-only";
import { addDays, farmToday, lastCompleteWeekStart, weekLabel } from "@/lib/dates";
import { getRefDate } from "@/server/repositories/reference";
import { runTool, type ToolName } from "./tools/registry";
import type { ToolContext } from "./tools/core";
import { SUGGESTED_QUESTIONS, filterSuggestions } from "./suggestions";

export interface FallbackStep {
  tool: ToolName;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
}

export interface FallbackAnswer {
  steps: FallbackStep[];
  text: string;
  recognized: string | null;
}

export { SUGGESTED_QUESTIONS };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const nf = (v: unknown, d = 1) => (v == null || !Number.isFinite(Number(v)) ? "—" : new Intl.NumberFormat("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(Number(v)));
const brl = (v: unknown, d = 2) => (v == null ? "—" : `${Number(v) < 0 ? "−" : ""}R$ ${nf(Math.abs(Number(v)), d)}`);
const dt = (s: unknown) => (typeof s === "string" ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "—");
const warn = (o: Record<string, unknown>) => ((o.avisos as string[]) ?? []).filter((a) => !a.startsWith("percentuais agregados") && !a.startsWith("é uma hipótese"));

export async function fallbackAnswer(ctx: ToolContext, question: string, screen: Record<string, unknown> = {}): Promise<FallbackAnswer> {
  const q = norm(question);
  const houses = Array.from(new Set((question.toUpperCase().match(/P\d{3}/g) ?? []).map((h) => h)));
  const flock = question.toUpperCase().match(/L\d{3}/)?.[0];
  const num = (re: RegExp, def: number) => Number(q.match(re)?.[1] ?? def);
  const steps: FallbackStep[] = [];
  const call = async (tool: ToolName, input: Record<string, unknown>) => {
    const output = await runTool(ctx, tool, input);
    steps.push({ tool, input, output });
    return output;
  };
  const refDate = await getRefDate();
  const lw = lastCompleteWeekStart(refDate);
  const ctxHouse = (typeof screen.galpao === "string" ? screen.galpao : null) as string | null;

  const errorOf = (o: Record<string, unknown>) => (o.erro ? `Não consegui responder: ${o.erro}` : null);
  const sc = ctx.scope;
  const allowedList = filterSuggestions([...sc.houseCodes], sc.canSeeFinance, sc.canRegister);

  // permissões antes de tudo: galpão fora do escopo e dados financeiros
  const blocked = houses.filter((h) => /^P00[1-8]$/.test(h) && !sc.houseCodes.has(h));
  if (blocked.length) return { steps, recognized: "sem_permissao", text: `O ${blocked.join(", ")} não está entre os galpões que você pode ver (${[...sc.houseCodes].sort().join(", ")}). Posso responder sobre esses.` };
  if (!sc.canSeeFinance && /(margem|lucro|receita|custo|preco|dinheiro|financ|descarte|vale manter|no vermelho|r\$)/.test(q)) {
    return { steps, recognized: "sem_permissao", text: "Seu perfil não tem acesso aos dados financeiros (margens, custos, preços e decisão de descarte). Posso ajudar com produção, qualidade, sanidade, nutrição, ambiência, eventos e alertas." };
  }

  // 12 — registrar vacinação (antes das outras, porque cita galpão e doença)
  if (/(registra|registre|anota|anote|lanca|lance)/.test(q) && /(vacin)/.test(q)) {
    const h = houses[0] ?? ctxHouse ?? "P002";
    const disease = q.match(/contra ([a-z ]+?)(?: hoje| ontem| de manha|\.|$)/)?.[1]?.trim();
    const day = /ontem/.test(q) ? addDays(farmToday(), -1) : farmToday();
    const hour = /tarde/.test(q) ? "14:00" : "07:00";
    const o = await call("preparar_evento", { tipo: "sanitario.vacinacao", galpoes: [h], inicio: `${day}T${hour}`, titulo: `Vacinação${disease ? ` contra ${disease}` : ""}`, descricao: question, certeza: "confirmado", detalhes: disease ? { vacina: disease } : {} });
    return { steps, recognized: "registrar_evento", text: errorOf(o) ?? `Preparei o registro abaixo: **vacinação no ${h}**, ${dt(day)} às ${hour}. Confira e clique em **Confirmar registro** — nada é gravado antes disso. Depois de confirmado, vou acompanhar os indicadores do ${h} nos próximos 10 dias.` };
  }

  // "Explique este gráfico" (botão Perguntar à IA, Parte 14.2): usa o contexto do gráfico
  if (/(explique|explica|explicar|o que mostra).*(grafico|isso|este)/.test(q) || (/grafico/.test(q) && Array.isArray(screen.metricas))) {
    const metricas = (Array.isArray(screen.metricas) ? screen.metricas : typeof screen.metrica === "string" ? [screen.metrica] : []) as string[];
    const per = (screen.periodo ?? {}) as { inicio?: string; fim?: string };
    const inicio = per.inicio ?? addDays(refDate, -29);
    const fim = per.fim ?? refDate;
    const gal = houses.length ? houses : ctxHouse ? [ctxHouse] : (screen.galpoes as string[] | undefined) ?? "todos";
    if (metricas.length) {
      const parts: string[] = [];
      for (const m of metricas.slice(0, 3)) {
        const o = await call("consultar_indicador", { metrica: m, galpoes: gal, inicio, fim, granularidade: "dia", referencia: "linhagem" });
        if (o.erro) { parts.push(`- ${m}: ${o.erro}`); continue; }
        const meta = o.metrica as { nome: string; unidade: string; casas_decimais: number };
        const res = o.resumo_por_galpao as Record<string, { valor_do_periodo: number | null; minimo: number | null; maximo: number | null; ultimo: number | null; primeiro?: number | null }>;
        const u = meta.unidade === "%" ? "%" : meta.unidade ? ` ${meta.unidade}` : "";
        for (const [h, r] of Object.entries(res).slice(0, 4)) {
          const ref = (o.referencias as Record<string, number | null>)[h];
          parts.push(`- **${meta.nome} — ${h}**: valor do período ${nf(r.valor_do_periodo, meta.casas_decimais)}${u}; mínimo ${nf(r.minimo, meta.casas_decimais)}${u}, máximo ${nf(r.maximo, meta.casas_decimais)}${u}; último dia ${nf(r.ultimo, meta.casas_decimais)}${u}${ref != null ? `; padrão da linhagem para a idade atual: ${nf(ref, meta.casas_decimais)}${u}` : ""}.`);
        }
      }
      const title = typeof screen.grafico === "string" ? `"${screen.grafico}"` : "o gráfico";
      return { steps, recognized: "explicar_grafico", text: `Sobre ${title}, de ${dt(inicio)} a ${dt(fim)}:\n\n${parts.join("\n")}\n\nNo modo sem IA eu descrevo os números do gráfico; para causas, abra o alerta do galpão ou pergunte "O que pode estar causando…".` };
    }
  }

  // 1 — qual galpão teve mais trincados
  if (/(qual|quais) galp/.test(q) && /(trinc|quebr|sujo|sangue|avaria|postura|mortal)/.test(q) && /(mais|maior|pior|menos|menor|melhor)/.test(q)) {
    const metric = /quebr/.test(q) ? "quebrados" : /sangue/.test(q) ? "sangue" : /sujo/.test(q) ? "sujos de fezes" : /avaria/.test(q) ? "avarias" : /postura/.test(q) ? "postura" : /mortal/.test(q) ? "mortalidade" : "trincados";
    const o = await call("consultar_indicador", { metrica: metric, galpoes: "todos", inicio: lw, fim: addDays(lw, 6), granularidade: "semana" });
    const e = errorOf(o);
    if (e) return { steps, recognized: "ranking_metrica", text: e };
    const res = o.resumo_por_galpao as Record<string, { valor_do_periodo: number | null }>;
    const lowWins = /(menos|menor|melhor)/.test(q) !== (metric === "postura");
    const sorted = Object.entries(res).filter(([, v]) => v.valor_do_periodo != null).sort((a, b) => (lowWins ? a[1].valor_do_periodo! - b[1].valor_do_periodo! : b[1].valor_do_periodo! - a[1].valor_do_periodo!));
    const m = o.metrica as { nome: string; unidade: string };
    const [top] = sorted;
    return {
      steps,
      recognized: "ranking_metrica",
      text: `Na ${weekLabel(lw).toLowerCase()} (última semana completa), o **${top[0]}** teve ${lowWins ? "o menor" : "o maior"} valor de ${m.nome.toLowerCase()}: **${nf(top[1].valor_do_periodo, 2)}${m.unidade === "%" ? "%" : ` ${m.unidade}`}**.\n\n| Galpão | ${m.nome} |\n|---|---|\n${sorted.map(([h, v]) => `| ${h} | ${nf(v.valor_do_periodo, 2)}${m.unidade === "%" ? "%" : ""} |`).join("\n")}\n\nFonte: ${o.fonte}. Percentual de cada galpão = soma dos defeitos ÷ soma dos ovos da semana.`,
    };
  }

  // 2/3 — por que caiu / o que causa
  if (/(por que|porque|o que pode|causa|causando|explica)/.test(q) && (houses.length || ctxHouse || screen.alerta)) {
    const h = houses[0] ?? ctxHouse;
    const metric = /trinc|avaria/.test(q) ? "trincados" : /sujo/.test(q) ? "sujos de fezes" : /sangue/.test(q) ? "sangue" : /agua/.test(q) ? "água" : /racao/.test(q) ? "ração" : /mortal|morte/.test(q) ? "mortalidade" : "postura";
    const heat = /calor/.test(q);
    let approx: string | null = null;
    if (heat && h) {
      const ev = await call("listar_eventos", { galpoes: [h], inicio: addDays(refDate, -60), fim: refDate, categorias: ["ambiente"] });
      const wave = ((ev.eventos as Array<{ tipo: string; inicio: string }>) ?? []).find((x) => /calor/i.test(x.tipo));
      approx = wave?.inicio ?? null;
    }
    const o = await call("explicar_anomalia", screen.alerta && !h ? { alerta_id: screen.alerta } : { galpao: h, metrica: metric, data_aproximada: approx });
    const e = errorOf(o);
    if (e) return { steps, recognized: "explicar", text: e };
    const a = o.alerta as { titulo: string; primeiro_desvio: string; galpao: string; id: string };
    const hy = o.hipoteses as Array<{ codigo: string; nome: string; confianca: string; nota: number; a_favor: string[]; contra: string[]; verificar: string[] }>;
    const dec = o.decomposicao as { frase: string } | null;
    let extra = "";
    if (metric === "postura" && a.galpao) {
      const t = await call("consultar_indicador", { metrica: "temperatura", galpoes: [a.galpao], inicio: addDays(a.primeiro_desvio, -3), fim: addDays(a.primeiro_desvio, 4) });
      const s = (t.series as Record<string, Array<{ x: string; valor: number }>>)[a.galpao] ?? [];
      if (s.length) extra = `\n\n**Temperatura máxima interna no ${a.galpao}:** ${s.map((p) => `${dt(p.x).slice(0, 5)} ${nf(p.valor)} °C`).join(" · ")}.`;
      const comp = await call("casos_parecidos", { alerta_id: a.id });
      const cs = (comp.casos as Array<{ data: string; galpao: string; causa: string; semelhanca_pct: number }>) ?? [];
      const per = { galpoes: [a.galpao], inicio: addDays(a.primeiro_desvio, -3), fim: addDays(a.primeiro_desvio, 4) };
      const fr = await call("consultar_indicador", { metrica: "ração", ...per });
      const wa = await call("consultar_indicador", { metrica: "água", ...per });
      const pv = (x: Record<string, unknown>) => (x.resumo_por_galpao as Record<string, { valor_do_periodo: number | null }> | undefined)?.[a.galpao]?.valor_do_periodo;
      if (!fr.erro && !wa.erro) extra += `\n\n**Ração e água no período (${dt(per.inicio).slice(0, 5)} a ${dt(per.fim).slice(0, 5)}):** ração ${nf(pv(fr))} g/ave/dia; água ${nf(pv(wa))} mL/ave/dia.`;
      if (cs.length) extra += `\n\n**Casos parecidos:** ${cs.map((c) => `${c.galpao} em ${dt(c.data)} (${c.causa.toLowerCase()}, ${c.semelhanca_pct}%)`).join("; ")}.`;
      if (hy[1]?.codigo === "resfriamento_insuficiente") extra += `\n\n**Comparação com os vizinhos:** outros galpões também caíram, mas o ${a.galpao} caiu mais — por isso resfriamento insuficiente neste galpão é a 2ª hipótese.`;
    }
    if (metric === "trincados" && a.galpao) {
      const per = { galpoes: [a.galpao], inicio: a.primeiro_desvio, fim: refDate };
      const p1 = await call("consultar_indicador", { metrica: "qual.trincados_pista1", ...per });
      const p2 = await call("consultar_indicador", { metrica: "qual.trincados_pista2", ...per });
      const pv = (x: Record<string, unknown>) => (x.resumo_por_galpao as Record<string, { valor_do_periodo: number | null }> | undefined)?.[a.galpao]?.valor_do_periodo;
      if (!p1.erro && !p2.erro) extra += `\n\n**Trincados por pista no ${a.galpao} (${dt(per.inicio).slice(0, 5)} a ${dt(per.fim).slice(0, 5)}):** pista 1 ${nf(pv(p1), 2)}% · pista 2 ${nf(pv(p2), 2)}%.`;
    }
    const [h1, h2] = hy;
    return {
      steps,
      recognized: "explicar",
      text: `${a.titulo} (desvio a partir de ${dt(a.primeiro_desvio)}). A hipótese principal é **${h1.nome.toLowerCase()}** (confiança ${h1.confianca}, nota ${h1.nota}).${h2 ? ` Em 2º lugar: ${h2.nome.toLowerCase()} (confiança ${h2.confianca}, nota ${h2.nota}).` : ""}\n\n**A favor:** ${h1.a_favor.slice(0, 5).join("; ") || "—"}.\n\n**Contra:** ${h1.contra.join("; ") || "nenhuma evidência contra"}.${dec ? `\n\n**Decomposição:** ${dec.frase}` : ""}${extra}\n\n**Verifique primeiro:** ${h1.verificar.slice(0, 3).join(", ")}.${warn(o).length ? `\n\nAvisos: ${warn(o).join("; ")}.` : ""}\n\nÉ uma hipótese, não um diagnóstico.`,
    };
  }

  // 4 — algo parecido antes
  if (/(parecido|semelhante|ja tivemos|aconteceu antes|historico)/.test(q)) {
    const h = houses[0] ?? ctxHouse;
    const o = await call("casos_parecidos", screen.alerta && !h ? { alerta_id: screen.alerta } : { galpao: h ?? "P007" });
    const e = errorOf(o);
    if (e) return { steps, recognized: "casos", text: e };
    const a = o.alerta as { titulo: string };
    const cs = o.casos as Array<{ data: string; galpao: string; lote: string; idade_semanas: number | null; causa: string; semelhanca_pct: number; dias_ate_recuperar: number | null; acao_tomada: string | null }>;
    if (!cs.length) return { steps, recognized: "casos", text: `Para "${a.titulo}" não encontrei casos com semelhança de 60% ou mais no histórico.` };
    return {
      steps,
      recognized: "casos",
      text: `Sim. Para "${a.titulo}", o caso mais parecido é o do **${cs[0].galpao} em ${dt(cs[0].data)}** (${cs[0].lote ?? "—"}${cs[0].idade_semanas != null ? `, ${cs[0].idade_semanas} semanas` : ""}): causa **${cs[0].causa.toLowerCase()}**, ${cs[0].semelhanca_pct}% de semelhança${cs[0].dias_ate_recuperar != null ? `, recuperou em ${cs[0].dias_ate_recuperar} dias` : ""}${cs[0].acao_tomada ? `; ação: ${cs[0].acao_tomada}` : ""}.\n\n| Data | Galpão | Causa | Semelhança |\n|---|---|---|---|\n${cs.map((c) => `| ${dt(c.data)} | ${c.galpao} | ${c.causa} | ${c.semelhanca_pct}% |`).join("\n")}${warn(o).length ? `\n\nAviso: ${warn(o).join("; ")}.` : ""}`,
    };
  }

  // 5 — compare galpões
  if (/compar/.test(q) && houses.length >= 2) {
    const weeks = num(/(\d+)\s*semana/, 4);
    const inicio = addDays(refDate, -(weeks * 7 - 1));
    const metrics = ["postura", "mortalidade", "avarias"];
    const outs: Array<Record<string, unknown>> = [];
    for (const m of metrics) outs.push(await call("comparar", { tipo: "galpoes", itens: houses.slice(0, 4), metrica: m, inicio, fim: refDate }));
    const e = outs.map(errorOf).find(Boolean);
    if (e) return { steps, recognized: "comparar", text: e };
    const rows = houses.slice(0, 4).map((h) => `| ${h} | ${outs.map((o) => nf((o.tabela as Array<{ item: string; media: number | null }>).find((t) => t.item === h)?.media, 2)).join(" | ")} |`);
    const avisos = Array.from(new Set(outs.flatMap(warn)));
    return { steps, recognized: "comparar", text: `Comparação de ${dt(inicio)} a ${dt(refDate)} (últimas ${weeks} semanas):\n\n| Galpão | Postura (%) | Mortalidade do período (%) | Avarias (%) |\n|---|---|---|---|\n${rows.join("\n")}\n\n${avisos.length ? `Avisos: ${avisos.join("; ")}.` : ""}` };
  }

  // 6 — linhagem melhor em ovo por ave alojada
  if (/linhage/.test(q)) {
    const metric = /mortal/.test(q) ? "mortalidade acumulada" : /postura|desvio/.test(q) ? "postura" : "ovo por ave alojada";
    const o = await call("comparar", { tipo: "linhagens", itens: [], metrica: metric });
    const e = errorOf(o);
    if (e) return { steps, recognized: "linhagens", text: e };
    const t = o.tabela as Array<{ item: string; n: number; media: number | null }>;
    const [best] = t.filter((x) => x.media != null);
    return { steps, recognized: "linhagens", text: `Pelo critério "${o.criterio}", a melhor linhagem é **${best?.item ?? "—"}** com ${nf(best?.media, 1)}.\n\n| Linhagem | Lotes | Valor |\n|---|---|---|\n${t.map((x) => `| ${x.item} | ${x.n} | ${nf(x.media, 1)} |`).join("\n")}\n\n${warn(o).length ? `Avisos: ${warn(o).join("; ")}.` : ""}` };
  }

  // 7 — plote / gráfico
  if (/(plot|grafic|mostre|mostra|desenhe)/.test(q)) {
    const days = num(/(\d+)\s*dia/, /(\d+)\s*semana/.test(q) ? num(/(\d+)\s*semana/, 6) * 7 : 60);
    const wanted: string[] = [];
    if (/temperatura/.test(q)) wanted.push("temperatura");
    if (/agua/.test(q)) wanted.push("água");
    if (/racao/.test(q)) wanted.push("ração");
    if (/postura/.test(q)) wanted.push("postura");
    if (/trinc/.test(q)) wanted.push("trincados");
    if (/sangue/.test(q)) wanted.push("sangue");
    if (/sujo/.test(q) && !/sangue/.test(q)) wanted.push("sujos de fezes");
    if (/mortal/.test(q)) wanted.push("mortalidade");
    const h = houses.length ? houses : ctxHouse ? [ctxHouse] : ["P005"];
    const o = await call("gerar_grafico", { tipo: "linha", titulo: question.replace(/[.?!]$/, ""), metricas: (wanted.length ? wanted : ["postura"]).slice(0, 4), galpoes: h, inicio: addDays(refDate, -(days - 1)), fim: refDate, marcar_eventos: true });
    const e = errorOf(o);
    if (e) return { steps, recognized: "grafico", text: e };
    return { steps, recognized: "grafico", text: `Aqui está o gráfico de ${(o.metricas as string[]).length} indicador(es) do ${h.join(", ")}, de ${dt((o.periodo as { inicio: string }).inicio)} a ${dt(refDate)}, com ${o.eventos_marcados} evento(s) marcado(s). Passe o mouse para ver os valores; clique numa faixa para abrir o evento.` };
  }

  // 8 — previsão de caixas
  if (/(quant|previs|vamos produzir|produzir)/.test(q) && /(caixa|ovo|produ)/.test(q) && /(semana|proxim)/.test(q)) {
    const weeks = Math.min(8, Math.max(1, num(/(\d+)\s*semana/, 4)));
    const o = await call("prever_producao", { galpoes: houses.length ? houses : "todos", semanas: weeks });
    const e = errorOf(o);
    if (e) return { steps, recognized: "previsao", text: e };
    const t = o.total_do_periodo as { caixas: number; caixas_min: number; caixas_max: number };
    const w = o.total_por_semana as Array<{ semana: number; inicio: string; caixas: number; caixas_min: number; caixas_max: number }>;
    return { steps, recognized: "previsao", text: `Nas próximas ${weeks} semanas (a partir de ${dt(o.a_partir_de)}), a previsão é de **${nf(t.caixas, 0)} caixas** (faixa de ${nf(t.caixas_min, 0)} a ${nf(t.caixas_max, 0)}).\n\n| Semana | Início | Caixas | Faixa |\n|---|---|---|---|\n${w.map((x) => `| ${x.semana} | ${dt(x.inicio)} | ${nf(x.caixas, 0)} | ${nf(x.caixas_min, 0)}–${nf(x.caixas_max, 0)} |`).join("\n")}\n\nPremissas: curva da linhagem + ajuste de cada lote e mortalidade padrão. ${warn(o).join("; ")}.` };
  }

  // 9 — vale manter o lote
  if (/(vale|compensa|manter|descart)/.test(q) && (flock || houses.length)) {
    const o = await call("simular_financeiro", { modo: "descarte", galpao_ou_lote: flock ?? houses[0], semanas: 16 });
    const e = errorOf(o);
    if (e) return { steps, recognized: "descarte", text: e };
    const ws = o.semanas as Array<{ semana: number; inicio: string; postura: number; margem_contribuicao: number }>;
    const horizon = num(/(\d+)\s*semana/, 8);
    const p = o.premissas as { preco_ovo_dz: number; preco_racao_kg: number; ajuste_do_lote_pp: number };
    const keep = ws.slice(0, horizon).every((w) => w.margem_contribuicao >= 0);
    return {
      steps,
      recognized: "descarte",
      text: `${keep ? "**Sim**" : "**Não necessariamente**"}: nas próximas ${horizon} semanas a margem de contribuição projetada do ${o.lote} ${keep ? "continua positiva" : "fica negativa em algumas semanas"}. Semana recomendada de descarte: **${o.semana_recomendada ?? "—"}**${o.data_recomendada ? ` (${dt(o.data_recomendada)})` : ""} — ${o.base_da_recomendacao}.\n\n| Semana | Início | Postura | Margem de contribuição |\n|---|---|---|---|\n${ws.slice(0, horizon).map((w) => `| ${w.semana} | ${dt(w.inicio)} | ${nf(w.postura)}% | ${brl(w.margem_contribuicao, 0)} |`).join("\n")}\n\nPremissas: ovo a ${brl(p.preco_ovo_dz)}/dz, ração a ${brl(p.preco_racao_kg)}/kg, postura pela curva ${p.ajuste_do_lote_pp >= 0 ? "+" : "−"}${nf(Math.abs(p.ajuste_do_lote_pp))} p.p., mortalidade padrão. A amortização da franga e a depreciação não entram: já foram gastas e não mudam com a decisão. Valores estimados.`,
    };
  }

  // 10 — cenário de preços
  if (/(preco|preço)/.test(norm(question)) && /(cair|cai|subir|sobe|aument|reduz|vermelho|negativ)/.test(q)) {
    const pct = num(/(\d+)\s*%/, 10) * (/(subir|sobe|aument)/.test(q) ? 1 : -1);
    const isFeed = /racao/.test(q) && !/ovo/.test(q);
    const o = await call("simular_financeiro", isFeed ? { modo: "cenario_precos", preco_racao: undefined, variacao_pct: 0, galpoes: "todos" } : { modo: "cenario_precos", variacao_pct: pct, galpoes: "todos" });
    const e = errorOf(o);
    if (e) return { steps, recognized: "precos", text: e };
    const g = o.galpoes as Array<{ galpao: string; margem_atual: number; margem_simulada: number; margem_dz_simulada: number | null }>;
    const red = o.no_vermelho as string[];
    return { steps, recognized: "precos", text: `Com o preço do ovo ${pct < 0 ? "caindo" : "subindo"} ${nf(Math.abs(pct), 0)}% (quantidades da ${String(o.semana_base).toLowerCase()}), ${red.length ? `ficam no vermelho: **${red.join(", ")}**` : "nenhum galpão fica no vermelho"}.\n\n| Galpão | Margem atual | Margem simulada | Margem/dz simulada |\n|---|---|---|---|\n${g.map((x) => `| ${x.galpao} | ${brl(x.margem_atual, 0)} | ${brl(x.margem_simulada, 0)} | ${brl(x.margem_dz_simulada)} |`).join("\n")}\n\nValores estimados.` };
  }

  // 11 — alertas abertos
  if (/alerta/.test(q)) {
    const o = await call("listar_alertas", { galpoes: houses.length ? houses : "todos", situacao: /todos|historico|resolvid/.test(q) ? "todos" : "abertos" });
    const e = errorOf(o);
    if (e) return { steps, recognized: "alertas", text: e };
    const al = o.alertas as Array<{ titulo: string; galpao: string; regra: string; severidade: string; situacao: string; aberto_em: string; hipotese_principal: string | null }>;
    if (!al.length) return { steps, recognized: "alertas", text: "Não há alertas abertos agora." };
    return { steps, recognized: "alertas", text: `Há **${o.total} alerta(s)** ${/todos/.test(q) ? "" : "abertos ou em investigação"} agora:\n\n| Alerta | Galpão | Regra | Situação | Desde | Hipótese principal |\n|---|---|---|---|---|---|\n${al.map((a) => `| ${a.titulo} | ${a.galpao} | ${a.regra} | ${a.situacao} | ${dt(a.aberto_em)} | ${a.hipotese_principal ?? "—"} |`).join("\n")}` };
  }

  // conhecimento / definição
  if (/(o que e|o que significa|defin|como calcula|meta de)/.test(q)) {
    const o = await call("buscar_conhecimento", { pergunta: question });
    const t = o.trechos as Array<{ fonte: string; texto: string }>;
    if (t.length) return { steps, recognized: "conhecimento", text: t.slice(0, 4).map((x) => `- ${x.texto} _(${x.fonte})_`).join("\n") };
  }

  return {
    steps,
    recognized: null,
    text: `No **modo demonstração sem IA** eu respondo estas perguntas (e variações próximas):\n\n${allowedList.map((s) => `- ${s}`).join("\n")}\n\nCom a chave da IA configurada, posso responder perguntas livres usando as mesmas ferramentas.`,
  };
}
