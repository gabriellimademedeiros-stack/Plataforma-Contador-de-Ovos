/**
 * Núcleo das 11 ferramentas do assistente (Parte 13.2). Cada ferramenta valida a entrada com Zod, aplica as permissões
 * do usuário no servidor e devolve JSON com `fonte` e `avisos`. As mesmas funções servem o modo com IA e o modo reserva.
 */
import "server-only";
import { z } from "zod";
import { getSql } from "@/db/client";
import { addDays, farmToday, lastCompleteWeekStart, weekLabel, weekStart } from "@/lib/dates";
import { HOUSE_COLORS } from "@/lib/colors";
import { METRIC_ALIASES, METRIC_BY_CODE, METRICS, isFinanceMetric } from "@/engine/metrics/catalog";
import { EVENT_TYPE_BY_CODE, EVENT_TYPES } from "@/engine/impacts/event-types";
import { KNOWLEDGE_BASE, causeName } from "@/engine/causes/knowledge-base";
import { DEFAULT_TARGETS } from "@/engine/standards/targets";
import { simulatePrices } from "@/engine/finance/price-sim";
import { mean, stdev } from "@/engine/stats";
import { cosineMasked } from "@/engine/stats";
import type { Scope } from "@/server/permissions";
import { getFlocks, getHouses, getRefDate, currentFlockOf } from "@/server/repositories/reference";
import { getStrainStandards, getInternalStandards } from "@/server/repositories/config";
import { listAlerts, listEvents } from "@/server/repositories/marks";
import { readDaily, readWeekly, windowAggregate, aggregateCells, farmSeries, type DailyRow, type WeeklyRowQ } from "@/server/services/metrics-query";
import { getCulling, getForecast, getPriceSimInputs, getStrainRanking } from "@/server/services/finance";
import type { ChartSpec } from "@/components/charts/types";
import { GLOSSARY } from "../glossary";

export interface ToolContext {
  scope: Scope;
}

export class ToolError extends Error {}

const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const d10 = (v: unknown) => (typeof v === "string" ? v.slice(0, 10) : (v as Date).toISOString().slice(0, 10));
const r = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);

/** Resolve nome comum ou código de métrica (Parte 13.2). */
export function resolveMetric(name: string, scope: Scope): string {
  const n = strip(name);
  const code = METRIC_BY_CODE[name] ? name : (METRIC_ALIASES[n] ?? METRICS.find((m) => strip(m.short) === n || strip(m.name) === n)?.code);
  if (!code) throw new ToolError(`Métrica desconhecida: "${name}". Métricas válidas: ${Object.keys(METRIC_ALIASES).join(", ")} ou um código do catálogo (ex.: prod.postura).`);
  if (isFinanceMetric(code) && !scope.canSeeFinance) throw new ToolError("Sem permissão: o perfil encarregado não tem acesso aos dados financeiros.");
  return code;
}

async function resolveHouses(ctx: ToolContext, galpoes: string[] | "todos" | undefined) {
  const all = (await getHouses()).map((h) => h.code);
  const avisos: string[] = [];
  if (!galpoes || galpoes === "todos" || (Array.isArray(galpoes) && galpoes.length === 0)) return { houses: all.filter((h) => ctx.scope.houseCodes.has(h)), avisos };
  const out: string[] = [];
  for (const g of galpoes) {
    const c = g.toUpperCase().trim();
    if (!all.includes(c)) throw new ToolError(`O galpão ${c} não existe. Galpões da granja: ${all.join(", ")}.`);
    if (!ctx.scope.houseCodes.has(c)) avisos.push(`sem acesso a ${c}`);
    else out.push(c);
  }
  if (!out.length) throw new ToolError(`Sem acesso aos galpões pedidos (${galpoes.join(", ")}).`);
  return { houses: out, avisos };
}

async function period(inicio?: string | null, fim?: string | null, defDays = 30) {
  const ref = await getRefDate();
  const to = fim && /^\d{4}-\d{2}-\d{2}$/.test(fim) ? (fim > ref ? ref : fim) : ref;
  const from = inicio && /^\d{4}-\d{2}-\d{2}$/.test(inicio) ? inicio : addDays(to, -(defDays - 1));
  return { from, to, ref };
}

const Houses = z.union([z.literal("todos"), z.array(z.string())]).optional();
const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data AAAA-MM-DD").optional().nullable();

// ------------------------------------------------------------------------------------------------
// 1. consultar_indicador
// ------------------------------------------------------------------------------------------------
export const consultarIndicadorInput = z.object({
  metrica: z.string().describe("código do catálogo (ex.: prod.postura) ou nome comum (postura, trincados, mortalidade, ração, água, temperatura, margem…)"),
  galpoes: Houses.describe('lista de galpões (ex.: ["P001"]) ou "todos"'),
  inicio: DateStr,
  fim: DateStr,
  granularidade: z.enum(["dia", "semana"]).default("dia"),
  referencia: z.enum(["linhagem", "interno", "meta"]).optional().nullable(),
});

const CONF_PT: Record<string, string> = { alta: "alta", media: "média", baixa: "baixa" };
const STATUS_PT: Record<string, string> = { aberto: "aberto", reconhecido: "reconhecido", em_investigacao: "em investigação", resolvido: "resolvido", descartado: "descartado" };

export async function consultarIndicador(ctx: ToolContext, i: z.infer<typeof consultarIndicadorInput>) {
  const metric = resolveMetric(i.metrica, ctx.scope);
  const { houses, avisos } = await resolveHouses(ctx, i.galpoes);
  const def = METRIC_BY_CODE[metric];
  const p0 = await period(i.inicio, i.fim, i.granularidade === "semana" ? 56 : 30);
  let from = p0.from;
  const to = p0.to;
  let gran = i.granularidade;
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
  if (gran === "dia" && days > 120) {
    gran = "semana";
    avisos.push("série com mais de 120 pontos: reduzida para semanal");
  }
  const series: Record<string, Array<{ x: string; valor: number | null }>> = {};
  const resumo: Record<string, Record<string, number | null>> = {};
  let granja: Array<{ x: string; valor: number | null }> = [];
  let granjaValor: number | null = null;
  if (gran === "semana") {
    if (from !== weekStart(from)) from = weekStart(from);
    const rows = await readWeekly(ctx.scope, { houses, metrics: [metric], from, to });
    for (const h of houses) series[h] = rows.filter((x) => x.house === h && x.metric === metric).map((x) => ({ x: x.weekStart, valor: r(x.value, def.decimals + 1), dias: x.daysCount } as never));
    const weeks = Array.from(new Set(rows.map((x) => x.weekStart))).sort();
    granja = weeks.map((w) => ({ x: w, valor: r(aggregateCells(metric, rows.filter((x) => x.weekStart === w), "granja").value, def.decimals + 1) }));
    for (const h of houses) resumo[h] = summarize(series[h].map((s) => s.valor), aggregateCells(metric, rows.filter((x) => x.house === h), "periodo").value);
    granjaValor = aggregateCells(metric, houses.map((h) => aggregateCells(metric, rows.filter((x) => x.house === h), "periodo")), "granja").value;
    if (weeks.length && rows.some((x) => x.daysCount < 7)) avisos.push("a última semana está em andamento (incompleta)");
  } else {
    const rows = await readDaily(ctx.scope, { houses, metrics: [metric], from, to });
    for (const h of houses) series[h] = rows.filter((x) => x.house === h).map((x) => ({ x: x.date, valor: r(x.value, def.decimals + 1) }));
    granja = farmSeries(rows, metric, from, to).map((p) => ({ x: p.date, valor: r(p.value, def.decimals + 1) }));
    for (const h of houses) resumo[h] = summarize(series[h].map((s) => s.valor), windowAggregate(rows, metric, from, to, [h]).byHouse.get(h)?.value ?? null);
    granjaValor = windowAggregate(rows, metric, from, to).total.value;
  }
  const granjaResumo = summarize(granja.map((g) => g.valor), null);
  // referências
  const refs: Record<string, number | null> = {};
  if (i.referencia) {
    const [flocks, std, internal] = await Promise.all([getFlocks(), getStrainStandards(), getInternalStandards()]);
    for (const h of houses) {
      const f = currentFlockOf(flocks, h, to);
      if (!f) continue;
      const w = Math.floor((Date.parse(to) - Date.parse(f.hatchDate)) / (7 * 86400000));
      if (i.referencia === "linhagem") refs[h] = r(std.week(f.strainCode, metric, w), 2);
      else if (i.referencia === "interno") {
        const v = internal.medianAt(f.strainCode, metric, w);
        if (v == null) avisos.push("padrão interno insuficiente; usando a curva da linhagem");
        refs[h] = r(v ?? std.week(f.strainCode, metric, w), 2);
      } else {
        const t = DEFAULT_TARGETS.find((x) => x.metricCode === metric);
        refs[h] = t ? (t.greenMax ?? t.greenMin) : null;
      }
    }
  }
  return {
    metrica: { codigo: metric, nome: def.name, unidade: def.unit, casas_decimais: def.decimals },
    periodo: { inicio: from, fim: to, granularidade: gran },
    resumo_por_galpao: resumo,
    granja: { resumo: { ...granjaResumo, valor_do_periodo: r(granjaValor, 3) }, serie: granja },
    series: series,
    referencias: refs,
    fonte: `${gran === "semana" ? "weekly_metrics" : "daily_metrics"}, ${from} a ${to}`,
    avisos: [...avisos, "percentuais agregados = soma dos numeradores ÷ soma dos denominadores"],
  };
}

function summarize(vals: Array<number | null>, periodValue: number | null) {
  const v = vals.filter((x): x is number => x != null);
  return {
    valor_do_periodo: r(periodValue, 3),
    minimo: v.length ? r(Math.min(...v), 3) : null,
    maximo: v.length ? r(Math.max(...v), 3) : null,
    ultimo: v.length ? r(v[v.length - 1], 3) : null,
    variacao: v.length > 1 ? r(v[v.length - 1] - v[0], 3) : null,
  };
}

// ------------------------------------------------------------------------------------------------
// 2. comparar
// ------------------------------------------------------------------------------------------------
export const compararInput = z.object({
  tipo: z.enum(["galpoes", "lotes", "linhagens", "periodos"]),
  itens: z.array(z.string()).default([]).describe("códigos de galpões (P001), lotes (L101), linhagens (ALFA) ou períodos 'AAAA-MM-DD/AAAA-MM-DD'; vazio em linhagens = todas"),
  metrica: z.string(),
  eixo: z.enum(["data", "idade"]).default("data"),
  inicio: DateStr,
  fim: DateStr,
});

export async function comparar(ctx: ToolContext, i: z.infer<typeof compararInput>) {
  const metric = resolveMetric(i.metrica, ctx.scope);
  if (i.tipo !== "linhagens" && i.itens.length < 2) throw new ToolError("Informe pelo menos dois itens para comparar.");
  const def = METRIC_BY_CODE[metric];
  const avisos: string[] = [];
  const tabela: Array<{ item: string; n: number; media: number | null; dp: number | null; idade_semanas?: number | null }> = [];
  const series: Record<string, Array<[string | number, number | null]>> = {};
  if (i.tipo === "linhagens") {
    const sr = await getStrainRanking(ctx.scope);
    for (const s of sr.filter((x) => i.itens.length === 0 || i.itens.map((y) => y.toUpperCase()).includes(x.strain) || i.itens.includes("todas"))) {
      const val = metric === "prod.oaa" ? s.oaa60 : metric === "mort.acumulada" ? s.mort60 : { mean: s.postureDev, n: s.active + s.closed };
      tabela.push({ item: `${s.strain} (${s.name})`, n: val.n, media: r(val.mean, 2), dp: null });
      if (s.warning) avisos.push(`${s.strain}: ${s.warning}`);
    }
    return { tipo: i.tipo, metrica: { codigo: metric, nome: def.name, unidade: def.unit }, criterio: metric === "prod.oaa" ? "ovo por ave alojada aos 60 semanas (média dos lotes que chegaram lá)" : metric === "mort.acumulada" ? "mortalidade acumulada aos 60 semanas" : "desvio médio de postura contra a própria curva", tabela: tabela.sort((a, b) => (b.media ?? -1e9) - (a.media ?? -1e9)), fonte: "weekly_metrics (lotes ativos e encerrados)", avisos };
  }
  const { from, to } = await period(i.inicio, i.fim, 28);
  if (i.tipo === "galpoes") {
    const { houses, avisos: a2 } = await resolveHouses(ctx, i.itens);
    avisos.push(...a2);
    const rows = await readDaily(ctx.scope, { houses, metrics: [metric], from, to });
    const flocks = await getFlocks();
    for (const h of houses) {
      const vals = rows.filter((x) => x.house === h && x.value != null);
      const f = currentFlockOf(flocks, h, to);
      const age = f ? Math.floor((Date.parse(to) - Date.parse(f.hatchDate)) / (7 * 86400000)) : null;
      tabela.push({ item: h, n: vals.length, media: r(windowAggregate(rows, metric, from, to, [h]).byHouse.get(h)?.value ?? null, 3), dp: r(stdev(vals.map((v) => v.value)), 3), idade_semanas: age });
      series[h] = vals.map((v) => [v.date, v.value]);
    }
    const ages = tabela.map((t) => t.idade_semanas).filter((x): x is number => x != null);
    if (ages.length > 1 && Math.max(...ages) - Math.min(...ages) >= 4) avisos.push(`idades diferentes (${tabela.map((t) => `${t.item}: ${t.idade_semanas} semanas`).join(", ")}): compare com cuidado; o ideal é comparar lotes na mesma semana de idade`);
  } else if (i.tipo === "lotes") {
    const flocks = await getFlocks();
    for (const code of i.itens.map((x) => x.toUpperCase())) {
      const f = flocks.find((x) => x.code === code);
      if (!f) throw new ToolError(`O lote ${code} não existe.`);
      if (!ctx.scope.houseCodes.has(f.houseCode)) {
        avisos.push(`sem acesso a ${f.houseCode}`);
        continue;
      }
      const w = await readWeekly(ctx.scope, { houses: [f.houseCode], metrics: [metric], from: f.startDate, to: f.endDate ?? to });
      const pts = w.filter((x) => x.flockId === f.id && x.daysCount >= 7);
      series[code] = pts.map((p) => [p.ageWeek, p.value]);
      tabela.push({ item: `${code} (${f.houseCode}, ${f.strainCode})`, n: pts.length, media: r(mean(pts.map((p) => p.value)), 3), dp: r(stdev(pts.map((p) => p.value)), 3) });
    }
    avisos.push("lotes comparados pela semana de idade");
  } else {
    for (const p of i.itens) {
      const [a, b] = p.split("/");
      const rows = await readDaily(ctx.scope, { metrics: [metric], from: a, to: b });
      const vals = farmSeries(rows, metric, a, b);
      series[p] = vals.map((v) => [v.date, v.value]);
      tabela.push({ item: p, n: vals.filter((v) => v.value != null).length, media: r(windowAggregate(rows, metric, a, b).total.value, 3), dp: r(stdev(vals.map((v) => v.value)), 3) });
    }
  }
  if (tabela.length >= 2) {
    const [x, y] = tabela;
    if (x.media != null && y.media != null && x.dp != null && y.dp != null && x.n > 1 && y.n > 1) {
      const se = Math.sqrt((x.dp * x.dp) / x.n + (y.dp * y.dp) / y.n);
      if (Math.abs(x.media - y.media) < 2 * se) avisos.push("diferença pequena demais para concluir");
    }
  }
  return { tipo: i.tipo, metrica: { codigo: metric, nome: def.name, unidade: def.unit }, eixo: i.tipo === "lotes" ? "idade" : i.eixo, periodo: { inicio: from, fim: to }, tabela, diferenca: tabela.length >= 2 && tabela[0].media != null && tabela[1].media != null ? r(tabela[0].media! - tabela[1].media!, 3) : null, series, fonte: `daily_metrics/weekly_metrics, ${from} a ${to}`, avisos };
}

// ------------------------------------------------------------------------------------------------
// 3. listar_eventos  ·  4. listar_alertas
// ------------------------------------------------------------------------------------------------
export const listarEventosInput = z.object({ galpoes: Houses, inicio: DateStr, fim: DateStr, categorias: z.array(z.string()).optional(), certeza: z.array(z.string()).optional() });

export async function listarEventos(ctx: ToolContext, i: z.infer<typeof listarEventosInput>) {
  const { houses, avisos } = await resolveHouses(ctx, i.galpoes);
  const { from, to } = await period(i.inicio, i.fim, 90);
  const ev = await listEvents({ houses, from, to, categories: i.categorias, certainty: i.certeza });
  const sql = getSql();
  const sums = ev.length ? await sql`select id, details->>'impact_summary' as s from app.events where id in ${sql(ev.map((e) => e.id))}` : [];
  return {
    eventos: ev.slice(0, 40).map((e) => ({ id: e.id, tipo: e.typeName, titulo: e.title, inicio: e.startDate, fim: e.endDate, galpoes: e.houses, certeza: e.certainty, origem: e.source, retrato: sums.find((x) => x.id === e.id)?.s ?? null })),
    total: ev.length,
    fonte: `events + event_impacts, ${from} a ${to}`,
    avisos: ev.length > 40 ? [...avisos, `mostrando 40 de ${ev.length} eventos`] : avisos,
  };
}

export const listarAlertasInput = z.object({ galpoes: Houses, situacao: z.enum(["abertos", "todos", "aberto", "reconhecido", "em_investigacao", "resolvido", "descartado"]).default("abertos"), inicio: DateStr, fim: DateStr, regra: z.string().optional().nullable() });

export async function listarAlertas(ctx: ToolContext, i: z.infer<typeof listarAlertasInput>) {
  const { houses, avisos } = await resolveHouses(ctx, i.galpoes);
  const statuses = i.situacao === "abertos" ? ["aberto", "reconhecido", "em_investigacao"] : i.situacao === "todos" ? undefined : [i.situacao];
  const { from, to } = await period(i.inicio, i.fim, 90);
  const list = await listAlerts({ houses, includeFarm: true, statuses, rules: i.regra ? [i.regra] : undefined, from: statuses?.every((s) => ["aberto", "reconhecido", "em_investigacao"].includes(s)) ? undefined : from, to, canSeeFinance: ctx.scope.canSeeFinance });
  return {
    alertas: list.slice(0, 30).map((a) => ({ id: a.id, titulo: a.title, galpao: a.house ?? "granja", regra: a.ruleCode, severidade: a.severity, situacao: STATUS_PT[a.status] ?? a.status, primeiro_desvio: a.firstDeviationOn, aberto_em: a.openedOn, hipotese_principal: a.topHypothesis ? `${a.topHypothesis.name} (confiança ${CONF_PT[a.topHypothesis.confidence] ?? a.topHypothesis.confidence})` : null })),
    total: list.length,
    fonte: "alerts",
    avisos,
  };
}

// ------------------------------------------------------------------------------------------------
// 5. explicar_anomalia  ·  6. casos_parecidos
// ------------------------------------------------------------------------------------------------
export const explicarAnomaliaInput = z.object({ alerta_id: z.string().uuid().optional().nullable(), galpao: z.string().optional().nullable(), metrica: z.string().optional().nullable(), data_aproximada: DateStr.describe("opcional: dia aproximado da anomalia, para escolher o alerta") });

async function pickAlert(ctx: ToolContext, i: { alerta_id?: string | null; galpao?: string | null; metrica?: string | null; data_aproximada?: string | null }) {
  const sql = getSql();
  if (i.alerta_id) {
    const [a] = await sql`select a.*, h.code as house from app.alerts a left join app.houses h on h.id = a.house_id where a.id = ${i.alerta_id}`;
    if (!a) throw new ToolError("Alerta não encontrado.");
    if (a.house && !ctx.scope.houseCodes.has(a.house)) throw new ToolError(`Sem acesso a ${a.house}.`);
    return a;
  }
  if (!i.galpao) throw new ToolError("Informe o id do alerta ou o galpão e a métrica.");
  const { houses } = await resolveHouses(ctx, [i.galpao]);
  const metric = i.metrica ? resolveMetric(i.metrica, ctx.scope) : null;
  const family: Record<string, string[]> = { "prod.postura": ["prod.postura"], "qual.trincados": ["qual.trincados", "qual.razao_pistas"], "qual.avarias": ["qual.trincados", "qual.razao_pistas"], "qual.razao_pistas": ["qual.razao_pistas", "qual.trincados"] };
  const metrics = metric ? (family[metric] ?? [metric]) : null;
  const rows = await sql`select a.*, h.code as house from app.alerts a join app.houses h on h.id = a.house_id where h.code = ${houses[0]} and a.rule_code not in ('P01','A22')
    ${metrics ? sql`and a.metric_code in ${sql(metrics)}` : sql``} order by (a.status in ('aberto','reconhecido','em_investigacao')) desc, a.opened_on desc limit 50`;
  if (!rows.length) throw new ToolError(`Não há alerta ${metric ? `de ${METRIC_BY_CODE[metric].short.toLowerCase()} ` : ""}no ${houses[0]}.`);
  if (i.data_aproximada) {
    const t = Date.parse(i.data_aproximada);
    return [...rows].sort((a, b) => Math.abs(Date.parse(d10(a.first_deviation_on)) - t) - Math.abs(Date.parse(d10(b.first_deviation_on)) - t))[0];
  }
  const open = rows.filter((a) => ["aberto", "reconhecido", "em_investigacao"].includes(a.status));
  return (open.length ? open : rows).sort((a, b) => (a.rule_code === "A05" ? 1 : 0) - (b.rule_code === "A05" ? 1 : 0))[0];
}

export async function explicarAnomalia(ctx: ToolContext, i: z.infer<typeof explicarAnomaliaInput>) {
  const a = await pickAlert(ctx, i);
  const hyps = (a.hypotheses ?? []) as Array<{ code: string; name: string; score: number; confidence: string; for: Array<{ text: string }>; against: Array<{ text: string }>; unverifiable: Array<{ text: string }>; bonus: Array<{ text: string }>; checks: string[] }>;
  return {
    alerta: { id: a.id, titulo: a.title, galpao: a.house, regra: a.rule_code, situacao: STATUS_PT[a.status] ?? a.status, primeiro_desvio: d10(a.first_deviation_on), aberto_em: d10(a.opened_on), observado: a.observed },
    hipoteses: hyps.map((h) => ({ codigo: h.code, nome: h.name, nota: Math.round(h.score), confianca: CONF_PT[h.confidence] ?? h.confidence, a_favor: [...h.bonus.map((b) => b.text), ...h.for.map((f) => f.text)], contra: h.against.map((c) => c.text), nao_verificavel: h.unverifiable.map((u) => u.text), verificar: h.checks })),
    decomposicao: a.decomposition ? { frase: a.decomposition.sentence, passos: a.decomposition.steps } : null,
    o_que_falta_saber: a.evidence?.what_to_know ?? [],
    texto: a.evidence?.explanation ?? null,
    causa_registrada: a.cause_code ? causeName(a.cause_code) : null,
    fonte: `alerts (${a.id}) — motor de causas determinístico`,
    avisos: ["é uma hipótese, não um diagnóstico", ...(hyps[0]?.confidence !== "alta" ? ["sem confirmação humana, a confiança fica no máximo média"] : [])],
  };
}

export const casosParecidosInput = z.object({ alerta_id: z.string().uuid().optional().nullable(), evento_id: z.string().uuid().optional().nullable(), galpao: z.string().optional().nullable(), metrica: z.string().optional().nullable(), limite: z.number().int().min(1).max(10).default(3) });

export async function casosParecidos(ctx: ToolContext, i: z.infer<typeof casosParecidosInput>) {
  const sql = getSql();
  if (i.evento_id) {
    const fps = await sql`select f.event_id, h.code as house, f.vector, e.title, e.type_code, e.starts_at from app.event_fingerprints f join app.houses h on h.id = f.house_id join app.events e on e.id = f.event_id where e.certainty = 'confirmado'`;
    const mine = fps.find((f) => f.event_id === i.evento_id);
    if (!mine) throw new ToolError("Evento sem impressão digital (sem retrato de impacto).");
    if (!ctx.scope.houseCodes.has(mine.house)) throw new ToolError(`Sem acesso a ${mine.house}.`);
    const casos = fps
      .filter((f) => f.event_id !== i.evento_id && ctx.scope.houseCodes.has(f.house))
      .map((f) => ({ id: f.event_id, galpao: f.house, titulo: f.title, data: d10(f.starts_at), semelhanca: r(cosineMasked(mine.vector as number[], f.vector as number[]), 2) }))
      .filter((c) => (c.semelhanca ?? 0) >= 0.6)
      .sort((a, b) => (b.semelhanca ?? 0) - (a.semelhanca ?? 0))
      .slice(0, i.limite);
    return { casos, fonte: "event_fingerprints", avisos: casos.length < 3 ? ["poucos casos: trate como indício, não como padrão"] : [] };
  }
  const a = await pickAlert(ctx, i);
  const sim = ((a.similar_cases ?? []) as Array<{ date: string; house: string; flock: string | null; ageWeek: number | null; cause: string; similarity: number; recoveryDays: number | null; action: string | null; kind: string; id: string }>).slice(0, i.limite);
  return {
    alerta: { id: a.id, titulo: a.title, galpao: a.house },
    casos: sim.map((s) => ({ data: s.date, galpao: s.house, lote: s.flock, idade_semanas: s.ageWeek, causa: causeName(s.cause), semelhanca_pct: Math.round(s.similarity * 100), dias_ate_recuperar: s.recoveryDays, acao_tomada: s.action, tipo: s.kind, id: s.id })),
    fonte: "alerts.similar_cases (impressão digital, cosseno)",
    avisos: sim.length < 3 ? ["poucos casos: trate como indício, não como padrão"] : [],
  };
}

// ------------------------------------------------------------------------------------------------
// 7. prever_producao  ·  8. simular_financeiro
// ------------------------------------------------------------------------------------------------
export const preverProducaoInput = z.object({ galpoes: Houses, semanas: z.number().int().min(1).max(8).default(4) });

export async function preverProducao(ctx: ToolContext, i: z.infer<typeof preverProducaoInput>) {
  const { houses, avisos } = await resolveHouses(ctx, i.galpoes);
  const f = await getForecast(ctx.scope, i.semanas);
  const rows = f.houses.filter((h) => houses.includes(h.house));
  const weeks = Array.from(new Set(rows.map((x) => x.weekStart))).sort();
  const total = weeks.map((w) => {
    const xs = rows.filter((x) => x.weekStart === w);
    const eggs = xs.reduce((a, x) => a + x.eggs, 0);
    return { semana: xs[0].week, inicio: w, ovos: Math.round(eggs), caixas: Math.round(eggs / 360), caixas_min: Math.round(xs.reduce((a, x) => a + x.eggsLow, 0) / 360), caixas_max: Math.round(xs.reduce((a, x) => a + x.eggsHigh, 0) / 360) };
  });
  return {
    a_partir_de: f.from,
    total_por_semana: total,
    total_do_periodo: { caixas: total.reduce((a, x) => a + x.caixas, 0), caixas_min: total.reduce((a, x) => a + x.caixas_min, 0), caixas_max: total.reduce((a, x) => a + x.caixas_max, 0), ovos: total.reduce((a, x) => a + x.ovos, 0) },
    por_galpao: houses.map((h) => ({ galpao: h, caixas: rows.filter((x) => x.house === h).map((x) => Math.round(x.boxes)) })),
    fonte: "motor de previsão (curva da linhagem + ajuste do lote; mortalidade padrão)",
    avisos: [...avisos, "faixa de incerteza de ± (1,0 + 0,3 × semana) p.p. de postura"],
  };
}

export const simularFinanceiroInput = z.object({
  modo: z.enum(["cenario_precos", "descarte"]),
  preco_ovo: z.number().min(1).max(15).optional().nullable(),
  variacao_pct: z.number().min(-80).max(200).optional().nullable(),
  preco_racao: z.number().min(0.5).max(6).optional().nullable(),
  galpoes: Houses,
  galpao_ou_lote: z.string().optional().nullable(),
  semanas: z.number().int().min(1).max(16).default(16),
});

export async function simularFinanceiro(ctx: ToolContext, i: z.infer<typeof simularFinanceiroInput>) {
  if (!ctx.scope.canSeeFinance) throw new ToolError("Sem permissão: o perfil encarregado não tem acesso aos dados financeiros.");
  if (i.modo === "descarte") {
    const flocks = await getFlocks();
    const key = (i.galpao_ou_lote ?? "").toUpperCase();
    const f = flocks.find((x) => x.status === "ativo" && (x.code === key || x.houseCode === key));
    if (!f) throw new ToolError(`Lote ou galpão "${key}" não encontrado entre os lotes ativos.`);
    const c = await getCulling(ctx.scope, f.code);
    if (!c) throw new ToolError(`Sem acesso ao lote ${f.code}.`);
    return {
      modo: "descarte",
      lote: c.flock,
      galpao: c.house,
      idade_semanas: c.ageWeek,
      premissas: { ajuste_do_lote_pp: r(c.adjustment, 1), preco_ovo_dz: c.egg, preco_racao_kg: c.feed, mortalidade: "padrão da linhagem", descarte_planejado: c.plannedCull },
      semanas: c.weeks.slice(0, i.semanas).map((w) => ({ semana: w.week, inicio: w.weekStart, idade: w.ageWeek, postura: r(w.posture, 1), ovos: Math.round(w.eggs), receita: Math.round(w.revenue), custos_evitaveis: Math.round(w.avoidableCost), margem_contribuicao: Math.round(w.contribution) })),
      semana_recomendada: c.recommendedWeek,
      data_recomendada: c.recommendedDate,
      base_da_recomendacao: c.basis === "margem" ? "primeira semana com margem de contribuição negativa por 2 semanas seguidas" : c.basis === "planejado" ? "a margem de contribuição segue positiva; recomenda-se o descarte planejado" : null,
      fonte: "motor financeiro (Parte 12.6)",
      avisos: ["valores estimados", "a amortização da franga e a depreciação não entram: já foram gastas e não mudam com a decisão", "a comparação com alojar o próximo lote mais cedo fica fora da beta"],
    };
  }
  const { houses, avisos } = await resolveHouses(ctx, i.galpoes);
  const inputs = await getPriceSimInputs(ctx.scope);
  const rows = inputs.houses.filter((h) => houses.includes(h.house)).map((h) => {
    const egg = (i.preco_ovo ?? h.currentEgg) * (1 + (i.variacao_pct ?? 0) / 100);
    const feed = i.preco_racao ?? h.currentFeed;
    const cur = simulatePrices(h, h.currentEgg, h.currentFeed);
    const sim = simulatePrices(h, egg, feed);
    return { galpao: h.house, margem_atual: Math.round(cur.margem), margem_simulada: Math.round(sim.margem), margem_dz_atual: r(cur.margemDz, 2), margem_dz_simulada: r(sim.margemDz, 2), postura: r(sim.posture, 1), postura_equilibrio_simulada: r(sim.breakEven, 1), preco_ovo_simulado: r(egg, 2), preco_racao_simulado: r(feed, 2) };
  });
  return {
    modo: "cenario_precos",
    semana_base: inputs.weekLabel,
    galpoes: rows,
    no_vermelho: rows.filter((x) => x.margem_simulada < 0).map((x) => x.galpao),
    margem_granja_atual: rows.reduce((a, x) => a + x.margem_atual, 0),
    margem_granja_simulada: rows.reduce((a, x) => a + x.margem_simulada, 0),
    fonte: "motor financeiro com as quantidades da última semana completa",
    avisos: [...avisos, "valores estimados (parâmetros simulados)"],
  };
}

// ------------------------------------------------------------------------------------------------
// 9. gerar_grafico
// ------------------------------------------------------------------------------------------------
export const gerarGraficoInput = z.object({
  tipo: z.enum(["linha", "barras", "dispersao", "calor"]).default("linha"),
  titulo: z.string().max(120),
  metricas: z.array(z.string()).min(1).max(4),
  galpoes: Houses,
  inicio: DateStr,
  fim: DateStr,
  eixo: z.enum(["data", "idade"]).default("data"),
  marcar_eventos: z.boolean().default(true),
  referencia: z.enum(["linhagem", "interno", "meta"]).optional().nullable(),
});

export async function gerarGrafico(ctx: ToolContext, i: z.infer<typeof gerarGraficoInput>) {
  const metrics = i.metricas.map((m) => resolveMetric(m, ctx.scope));
  const { houses, avisos } = await resolveHouses(ctx, i.galpoes);
  const hs = houses.slice(0, 8);
  const { from, to } = await period(i.inicio, i.fim, 60);
  const rows = await readDaily(ctx.scope, { houses: hs, metrics, from, to });
  const ev = i.marcar_eventos ? await listEvents({ houses: hs, from, to }) : [];
  const marks = ev.filter((e) => e.certainty !== "descartado").map((e) => ({ id: e.id, label: e.title.length > 30 ? e.title.slice(0, 28) + "…" : e.title, category: e.category, from: e.startDate, to: e.endDate && e.endDate !== e.startDate ? e.endDate : null }));
  const specs: ChartSpec[] = metrics.map((m) => {
    const def = METRIC_BY_CODE[m];
    return {
      kind: i.tipo === "barras" ? "bar" : "timeseries",
      title: metrics.length > 1 ? def.short : i.titulo,
      unit: def.unit,
      decimals: def.decimals,
      series: hs.map((h) => ({ name: h, color: HOUSE_COLORS[h], type: i.tipo === "barras" ? "bar" : i.tipo === "dispersao" ? "scatter" : "line", data: rows.filter((x: DailyRow) => x.house === h && x.metric === m).map((x) => [x.date, x.value] as [string, number | null]) })),
      categories: i.tipo === "barras" ? Array.from(new Set(rows.map((x) => x.date))).sort() : undefined,
      events: marks,
      source: `daily_metrics, ${from} a ${to}`,
    };
  });
  return { titulo: i.titulo, graficos: specs, metricas: metrics, galpoes: hs, periodo: { inicio: from, fim: to }, eventos_marcados: marks.length, fonte: `daily_metrics, ${from} a ${to}`, avisos: [...avisos, ...(houses.length > 8 ? ["no máximo 8 galpões por gráfico"] : [])] };
}

// ------------------------------------------------------------------------------------------------
// 10. preparar_evento  ·  11. buscar_conhecimento
// ------------------------------------------------------------------------------------------------
export const prepararEventoInput = z.object({
  tipo: z.string().describe("código do tipo (ex.: sanitario.vacinacao)"),
  galpoes: z.array(z.string()).min(1),
  inicio: z.string().describe("AAAA-MM-DDTHH:mm no horário da granja"),
  fim: z.string().optional().nullable(),
  titulo: z.string().max(160),
  descricao: z.string().max(2000).optional().nullable(),
  certeza: z.enum(["suspeito", "provavel", "confirmado"]).default("confirmado"),
  detalhes: z.record(z.string(), z.unknown()).optional().nullable(),
});

export async function prepararEvento(ctx: ToolContext, i: z.infer<typeof prepararEventoInput>) {
  const def = EVENT_TYPE_BY_CODE[i.tipo];
  if (!def) throw new ToolError(`Tipo de evento desconhecido: ${i.tipo}. Tipos válidos: ${EVENT_TYPES.map((t) => t.code).join(", ")}.`);
  const { houses, avisos } = await resolveHouses(ctx, i.galpoes);
  return {
    rascunho: { typeCode: i.tipo, typeName: def.name, houses, title: i.titulo, startsAt: i.inicio.length === 10 ? `${i.inicio}T07:00` : i.inicio.slice(0, 16), endsAt: i.fim ?? null, description: i.descricao ?? null, certainty: i.certeza, details: i.detalhes ?? {}, source: "assistente" },
    instrucao: "Rascunho: o registro só acontece quando o usuário clicar em Confirmar registro.",
    fonte: "event_types",
    avisos,
  };
}

export const buscarConhecimentoInput = z.object({ pergunta: z.string().min(2) });

export async function buscarConhecimento(ctx: ToolContext, i: z.infer<typeof buscarConhecimentoInput>) {
  const q = strip(i.pergunta).split(/\W+/).filter((w) => w.length > 2);
  const score = (t: string) => q.reduce((a, w) => a + (strip(t).includes(w) ? 1 : 0), 0);
  const sql = getSql();
  const mem = await sql`select text from app.company_memory where active order by created_at desc`;
  const items = [
    ...GLOSSARY.map((g) => ({ fonte: "glossário", texto: `${g.termo}: ${g.significado}` })),
    ...METRICS.filter((m) => !m.internal && (!m.finance || ctx.scope.canSeeFinance)).map((m) => ({ fonte: "definição de métrica", texto: `${m.name} (${m.unit}): ${m.description}` })),
    ...KNOWLEDGE_BASE.map((h) => ({ fonte: "base de hipóteses", texto: `${h.name}: o que verificar — ${h.checks.join(", ")}` })),
    ...DEFAULT_TARGETS.map((t) => ({ fonte: "metas", texto: `${t.label}: verde ${t.greenMin != null ? `≥ ${t.greenMin}` : `≤ ${t.greenMax}`}; amarelo ${t.yellowMin != null ? `≥ ${t.yellowMin}` : `≤ ${t.yellowMax}`}` })),
    ...mem.map((m) => ({ fonte: "memória da empresa", texto: m.text as string })),
  ];
  const found = items.map((x) => ({ ...x, s: score(x.texto) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 8).map(({ fonte, texto }) => ({ fonte, texto }));
  return { trechos: found, fonte: "glossário (Anexo C), catálogo de métricas, base de hipóteses, metas e memória da empresa", avisos: found.length ? [] : ["nada encontrado na base de conhecimento"] };
}

export { toolLabel } from "../labels";

export function farmTodayLocal() {
  return farmToday();
}

export { lastCompleteWeekStart, weekLabel, type WeeklyRowQ };
