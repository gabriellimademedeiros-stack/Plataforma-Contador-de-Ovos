/** Relatório Semanal — 11 páginas (Parte 15.1). Escopo: lotes com 26 semanas ou mais, agrupados por fase. */
import "server-only";
import { getSql } from "@/db/client";
import { addDays } from "@/lib/dates";
import { fmtBRL, fmtInt, fmtNumber } from "@/lib/format";
import { HOUSE_COLORS } from "@/lib/colors";
import type { TargetDef } from "@/engine/standards/targets";
import { getTargets } from "@/server/repositories/config";
import { KNOWLEDGE_BASE } from "@/engine/causes/knowledge-base";
import { RANK_COMPONENTS } from "@/engine/ranking/houses";
import { whatChanged } from "@/engine/text/report";
import type { Scope } from "@/server/permissions";
import { listAlerts, listEvents } from "@/server/repositories/marks";
import { getRanking, getStrainRanking, weekFinance } from "@/server/services/finance";
import type { ChartSpec } from "@/components/charts/types";
import type { RBlock, ReportModel, RPage, RRow } from "@/components/reports/types";
import { c, delta, dm, dmy, loadWeek, num, targetTone, type WeekCtx } from "./common";

type TF = (m: string) => TargetDef | undefined;
const SEV_RANK: Record<string, number> = { critica: 0, alta: 1, media: 2, aviso: 3, baixa: 4 };
const SEV_PT: Record<string, string> = { critica: "crítica", alta: "alta", media: "média", baixa: "baixa", aviso: "aviso" };
const CONF_PT: Record<string, string> = { alta: "alta", media: "média", baixa: "baixa" };
const OPEN = ["aberto", "reconhecido", "em_investigacao"];

/** Classe do problema para "Lotes em observação" (página 10). */
export const PROBLEM_CLASS: Record<string, "Estruturais" | "Sanitários" | "Nutricionais"> = {
  equipamento_esteira: "Estruturais",
  resfriamento_insuficiente: "Estruturais",
  estresse_termico: "Estruturais",
  falha_agua: "Estruturais",
  falha_distribuicao_racao: "Estruturais",
  vazamento_bebedouro: "Estruturais",
  falha_energia_ventilacao: "Estruturais",
  programa_luz: "Estruturais",
  estresse_manejo: "Estruturais",
  idade_lote: "Estruturais",
  doenca_infecciosa: "Sanitários",
  enterite: "Sanitários",
  acaro_vermelho: "Sanitários",
  bicagem: "Sanitários",
  ovos_grandes_prolapso: "Sanitários",
  problema_racao: "Nutricionais",
  nutricional_casca: "Nutricionais",
  excesso_sodio: "Nutricionais",
};

function phaseRows(ctx: WeekCtx, row: (h: string) => RRow): RRow[] {
  const out: RRow[] = [];
  for (const p of ctx.byPhase) {
    out.push({ group: p.label });
    for (const h of p.houses) out.push(row(h));
  }
  return out;
}

function barSpec(title: string, unit: string, decimals: number, items: Array<{ x: string; v: number | null; color?: string }>, ref?: number): ChartSpec {
  return {
    kind: "bar",
    title,
    unit,
    decimals,
    xType: "category",
    categories: items.map((i) => i.x),
    series: [{ name: title, type: "bar", data: items.map((i) => [i.x, i.v]), colors: items.map((i) => i.color ?? null) }],
    refLines: ref != null ? [{ name: "", y: ref, dashed: true }] : undefined,
    height: 200,
  };
}

function trendSpec(ctx: WeekCtx, metric: string, title: string, decimals: number): ChartSpec {
  const weeks = Array.from({ length: 8 }, (_, k) => addDays(ctx.ws, -7 * (7 - k)));
  return {
    kind: "timeseries",
    title,
    unit: "%",
    decimals,
    xType: "category",
    categories: weeks.map(dm),
    series: ctx.reportHouses.map((h) => ({ name: h, color: HOUSE_COLORS[h], type: "line" as const, data: weeks.map((w) => [dm(w), ctx.val(h, metric, w)] as [string, number | null]) })),
    height: 200,
  };
}

/** Tabela de defeitos (páginas 5 e 6): semana × anterior × média de 4 semanas, e pista quando houver diferença. */
function defectBlocks(ctx: WeekCtx, pairs: Array<{ m: string; label: string; lane: string }>, T: TF): RBlock[] {
  const cols = ["Galpão"];
  for (const p of pairs) cols.push(`${p.label} semana`, "anterior", "média 4 sem.");
  cols.push("Por pista (quando difere)");
  const rows = phaseRows(ctx, (h) => {
    const r = [c(h, null, true)];
    const lanes: string[] = [];
    for (const p of pairs) {
      const v = ctx.val(h, p.m);
      r.push(c(v == null ? "—" : `${fmtNumber(v, 2)}%`, targetTone(v, T(p.m))), num(ctx.val(h, p.m, ctx.prev), 2, "%"), num(ctx.avg4(h, p.m), 2, "%"));
      const l1 = ctx.val(h, `${p.lane}_pista1`);
      const l2 = ctx.val(h, `${p.lane}_pista2`);
      if (l1 != null && l2 != null && Math.min(l1, l2) > 0 && Math.max(l1, l2) / Math.min(l1, l2) >= 1.5) lanes.push(`${p.label}: pista 1 ${fmtNumber(l1, 2)}% · pista 2 ${fmtNumber(l2, 2)}%`);
    }
    r.push(c(lanes.join("; ") || "—", lanes.length ? "warn" : "muted"));
    return r;
  });
  return [{ type: "table", columns: cols, align: ["l", ...pairs.flatMap(() => ["r", "r", "r"] as const), "l"], rows, note: "Cores contra as metas da Parte 8.5. Média de 4 semanas = soma dos defeitos ÷ soma dos ovos das 4 semanas anteriores." }];
}

export async function buildWeeklyReport(scope: Scope, ws: string, scopeNote: string | null = null): Promise<ReportModel> {
  const ctx = await loadWeek(scope, ws);
  const sql = getSql();
  const we = addDays(ws, 6);
  const targets = await getTargets();
  const T: TF = (m) => targets.find((t) => t.metricCode === m && !t.phase) ?? targets.find((t) => t.metricCode === m);
  const fin = scope.canSeeFinance;
  const pages: RPage[] = [];

  // dados compartilhados
  const alerts = await listAlerts({ houses: ctx.houses, canSeeFinance: fin, from: ws });
  const openAtEnd = alerts.filter((a) => a.openedOn <= we && (OPEN.includes(a.status) ? true : (a.closedOn ?? "9999") > we));
  const newInWeek = alerts.filter((a) => a.openedOn >= ws && a.openedOn <= we);
  const finance = fin ? await weekFinance(scope, ws) : [];
  const finBy = new Map(finance.map((f) => [f.house, f]));

  // ---------------- 1. Resumo executivo ----------------
  const fEggs = ctx.farm("prod.ovos");
  const fEggsPrev = ctx.farm("prod.ovos", ctx.prev);
  const fPost = ctx.farm("prod.postura");
  const fPostPrev = ctx.farm("prod.postura", ctx.prev);
  const fMort = ctx.farm("mort.diaria");
  const fMortPrev = ctx.farm("mort.diaria", ctx.prev);
  const defects = (w: string) => {
    const a = ctx.farm("qual.avarias", w);
    const s = ctx.farm("qual.sujos", w);
    return a != null && s != null ? a + s : null;
  };
  const fDef = defects(ws);
  const fDefPrev = defects(ctx.prev);
  const fMarg = fin ? ctx.farm("fin.margem") : null;
  const fMargPrev = fin ? ctx.farm("fin.margem", ctx.prev) : null;
  const devs = ctx.reportHouses.map((h) => ({ house: h, dev: ctx.val(h, "prod.desvio_interno") })).filter((x): x is { house: string; dev: number } => x.dev != null).sort((a, b) => a.dev - b.dev);
  const pct = (a: number | null, b: number | null) => (a != null && b ? ((a - b) / b) * 100 : null);
  const line = (txt: string, v: number | null, hb: boolean | null) => ({ text: txt, tone: v == null || hb == null || Math.abs(v) < 1e-9 ? null : (v > 0) === hb ? ("good" as const) : ("bad" as const) });
  const ppTxt = (v: number | null, d = 1) => (v == null ? "—" : `${v >= 0 ? "+" : "−"}${fmtNumber(Math.abs(v), d)} p.p.`);
  const kpis = [
    { label: "Ovos e caixas", value: `${fmtInt(fEggs)} (${fmtInt(fEggs != null ? fEggs / 360 : null)} cx)`, lines: [line(`${pct(fEggs, fEggsPrev) != null ? `${pct(fEggs, fEggsPrev)! >= 0 ? "+" : "−"}${fmtNumber(Math.abs(pct(fEggs, fEggsPrev)!), 1)}%` : "—"} × semana anterior`, pct(fEggs, fEggsPrev), true)] },
    { label: "Postura (ave-dia)", value: `${fmtNumber(fPost, 1)}%`, lines: [line(`${ppTxt(fPost != null && fPostPrev != null ? fPost - fPostPrev : null)} × semana anterior`, fPost != null && fPostPrev != null ? fPost - fPostPrev : null, true), { text: `Desvio × padrão interno: ${ppTxt(ctx.farm("prod.desvio_interno"))}`, tone: targetTone(ctx.farm("prod.desvio_interno"), T("prod.desvio_interno")) }] },
    { label: "Mortalidade da semana", value: `${fmtNumber(fMort, 2)}%`, lines: [line(`${ppTxt(fMort != null && fMortPrev != null ? fMort - fMortPrev : null, 2)} × semana anterior`, fMort != null && fMortPrev != null ? fMort - fMortPrev : null, false), { text: "Meta ≤ 0,10% por semana", tone: targetTone(fMort, T("mort.diaria")) }] },
    { label: "Avarias + sujos", value: `${fmtNumber(fDef, 2)}%`, lines: [line(`${ppTxt(fDef != null && fDefPrev != null ? fDef - fDefPrev : null, 2)} × semana anterior`, fDef != null && fDefPrev != null ? fDef - fDefPrev : null, false), { text: "Referência: metas 2,5% + 0,6% + 1,8% + 0,5%", tone: null }] },
    fin
      ? { label: "Margem (estimada)", value: fmtBRL(fMarg, 0), lines: [line(`${fMarg != null && fMargPrev != null ? `${fMarg - fMargPrev >= 0 ? "+" : "−"}${fmtBRL(Math.abs(fMarg - fMargPrev), 0)}` : "—"} × semana anterior`, fMarg != null && fMargPrev != null ? fMarg - fMargPrev : null, true), { text: `Margem/dz: ${fmtBRL(ctx.farm("fin.margem_dz"), 2)}`, tone: targetTone(ctx.farm("fin.margem_dz"), T("fin.margem_dz")) }] }
      : { label: "Margem", value: "—", lines: [{ text: "Sem acesso a dados financeiros", tone: "muted" as const }] },
  ];
  const changed = whatChanged({
    posture: fPost,
    posturePrev: fPostPrev,
    mort: fMort,
    mortPrev: fMortPrev,
    defects: fDef,
    defectsPrev: fDefPrev,
    margin: fMarg,
    marginPrev: fMargPrev,
    worstHouse: devs[0] ?? null,
    bestHouse: devs[devs.length - 1] ?? null,
    openAlerts: openAtEnd.length,
    newAlerts: newInWeek.length,
    negativeMargin: finance.filter((f) => f.sum.margem < 0).map((f) => f.house),
  });
  const postureTrend: ChartSpec = {
    kind: "timeseries",
    title: "Postura da granja — últimas 8 semanas",
    unit: "%",
    decimals: 1,
    xType: "category",
    categories: Array.from({ length: 8 }, (_, k) => dm(addDays(ws, -7 * (7 - k)))),
    series: [{ name: "Granja", color: "#047857", type: "line", data: Array.from({ length: 8 }, (_, k) => addDays(ws, -7 * (7 - k))).map((w) => [dm(w), ctx.farm("prod.postura", w)] as [string, number | null]) }],
    height: 190,
  };
  pages.push({ n: 1, title: "Resumo executivo", subtitle: ctx.label, blocks: [{ type: "kpis", items: kpis }, { type: "text", title: "O que mudou", lines: changed, style: "numbered" }, { type: "chart", spec: postureTrend, height: 190 }] });

  // ---------------- 2. Prioridades da semana ----------------
  const kb = new Map(KNOWLEDGE_BASE.map((h) => [h.code, h]));
  const pri = openAtEnd
    .filter((a) => a.ruleCode !== "P01" || true)
    .sort((a, b) => (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9) || (a.openedOn < b.openedOn ? 1 : -1))
    .slice(0, 5)
    .map((a) => {
      const h = a.topHypothesis;
      const checks = h ? (kb.get(h.code)?.checks ?? []).slice(0, 2) : [];
      return {
        head: `${a.house ?? "Granja"} — ${a.title}`,
        tag: `${a.ruleCode} · severidade ${SEV_PT[a.severity] ?? a.severity}`,
        tone: SEV_RANK[a.severity] <= 1 ? ("bad" as const) : ("warn" as const),
        lines: [`Desde ${dmy(a.firstDeviationOn)} · situação: ${a.status.replace("em_investigacao", "em investigação")}`, `Hipótese principal: ${h ? `${h.name} (confiança ${CONF_PT[h.confidence] ?? h.confidence})` : "sem hipótese (alerta preventivo ou financeiro)"}`, `Ação sugerida: ${checks.length ? `verificar ${checks.join(" e ").toLowerCase()}` : a.ruleCode === "A22" ? "avaliar a decisão de descarte" : a.ruleCode === "P01" ? "preparar ventilação, nebulização e água fresca" : "acompanhar na ficha do galpão"}`],
      };
    });
  for (const d of devs) {
    if (pri.length >= 5) break;
    if (d.dev >= -1 || pri.some((p) => p.head.startsWith(d.house))) continue;
    pri.push({ head: `${d.house} — postura ${fmtNumber(d.dev, 1)} p.p. abaixo do padrão interno`, tag: "maior desvio", tone: "warn", lines: ["Sem alerta aberto para este desvio.", "Ação sugerida: conferir a curva por idade e o histórico do lote na ficha do galpão."] });
  }
  pages.push({ n: 2, title: "Prioridades da semana", subtitle: "Até 5 itens, por severidade e impacto (alertas abertos e maiores desvios)", blocks: [{ type: "items", items: pri, empty: "Sem prioridades: nenhum alerta aberto e nenhum desvio relevante." }] });

  // ---------------- 3. Produção por lote ----------------
  const prodRows = phaseRows(ctx, (h) => {
    const f = ctx.flockOf(h);
    const age = ctx.ageOf(h);
    const oaaStd = f && age != null ? ctx.std.week(f.strainCode, "prod.oaa", age) : null;
    const oaa = ctx.val(h, "prod.oaa");
    return [c(h, null, true), c(f?.code ?? "—"), c(f?.strainName ?? "—"), num(age, 0), num(ctx.val(h, "prod.postura"), 1, "%"), c(ctx.val(h, "prod.desvio_interno") == null ? "—" : `${ctx.val(h, "prod.desvio_interno")! >= 0 ? "+" : "−"}${fmtNumber(Math.abs(ctx.val(h, "prod.desvio_interno")!), 1)}`, targetTone(ctx.val(h, "prod.desvio_interno"), T("prod.desvio_interno"))), delta(ctx.val(h, "prod.desvio_linhagem"), 1, true), num(oaa, 1), num(oaaStd, 1), delta(oaa != null && oaaStd != null ? oaa - oaaStd : null, 1, true)];
  });
  pages.push({
    n: 3,
    title: "Produção por lote",
    subtitle: "Lotes com 26 semanas ou mais, por fase",
    blocks: [
      { type: "table", columns: ["Galpão", "Lote", "Linhagem", "Idade (sem.)", "Postura", "Desvio × interno (p.p.)", "Desvio × linhagem (p.p.)", "Ovo/ave alojada", "Curva", "Δ curva"], align: ["l", "l", "l", "r", "r", "r", "r", "r", "r", "r"], rows: prodRows },
      { type: "chart", spec: barSpec("Desvio de postura × padrão interno (p.p.)", "p.p.", 1, ctx.reportHouses.map((h) => ({ x: h, v: ctx.val(h, "prod.desvio_interno"), color: (ctx.val(h, "prod.desvio_interno") ?? 0) < -1 ? "#dc2626" : (ctx.val(h, "prod.desvio_interno") ?? 0) < 0 ? "#f59e0b" : "#059669" })), 0), height: 190 },
    ],
  });

  // ---------------- 4. Mortalidade e viabilidade ----------------
  const dr = await sql`select h.code, d.date::text as date, d.deaths, d.deaths_by_cause from app.daily_records d join app.houses h on h.id = d.house_id
    where h.code in ${sql(ctx.reportHouses.length ? ctx.reportHouses : ["__"])} and d.date between ${addDays(ws, -28)} and ${we}`;
  const causes = new Map<string, Record<string, number>>();
  const peaks: string[] = [];
  for (const h of ctx.reportHouses) {
    const mine = dr.filter((r) => r.code === h);
    const base = mine.filter((r) => r.date < ws).map((r) => Number(r.deaths)).sort((a, b) => a - b);
    const med = base.length ? base[Math.floor(base.length / 2)] : 0;
    const agg: Record<string, number> = {};
    for (const r of mine.filter((x) => x.date >= ws)) {
      for (const [k, v] of Object.entries((r.deaths_by_cause ?? {}) as Record<string, number>)) agg[k] = (agg[k] ?? 0) + Number(v);
      if (med > 0 && Number(r.deaths) >= Math.max(2 * med, med + 10)) peaks.push(`${h} em ${dm(r.date)}: ${r.deaths} mortes (${fmtNumber(Number(r.deaths) / med, 1)} × a mediana das 4 semanas anteriores)`);
    }
    causes.set(h, agg);
  }
  const causeKeys = Array.from(new Set([...causes.values()].flatMap((x) => Object.keys(x)))).sort();
  const CAUSE_PT: Record<string, string> = { outras: "Outras", refugo: "Refugo", prolapso: "Prolapso", desconhecida: "Desconhecida", calor: "Calor", bicagem: "Bicagem", doenca: "Doença", sufocamento: "Sufocamento" };
  pages.push({
    n: 4,
    title: "Mortalidade e viabilidade",
    blocks: [
      {
        type: "table",
        columns: ["Galpão", "Lote", "Mort. semana", "Anterior", "Mort. acumulada", "Curva da linhagem", "Δ curva (p.p.)", "Viabilidade"],
        rows: phaseRows(ctx, (h) => {
          const f = ctx.flockOf(h);
          const age = ctx.ageOf(h);
          const acc = ctx.val(h, "mort.acumulada");
          const std = f && age != null ? ctx.std.week(f.strainCode, "mort.acumulada", age) : null;
          return [c(h, null, true), c(f?.code ?? "—"), c(ctx.val(h, "mort.diaria") == null ? "—" : `${fmtNumber(ctx.val(h, "mort.diaria"), 2)}%`, targetTone(ctx.val(h, "mort.diaria"), T("mort.diaria"))), num(ctx.val(h, "mort.diaria", ctx.prev), 2, "%"), num(acc, 2, "%"), num(std, 2, "%"), delta(acc != null && std != null ? acc - std : null, 2, false), num(ctx.val(h, "mort.viabilidade"), 2, "%")];
        }),
        align: ["l", "l"],
      },
      {
        type: "grid",
        cols: 2,
        blocks: [
          { type: "table", title: "Mortes da semana por causa", columns: ["Galpão", ...causeKeys.map((k) => CAUSE_PT[k] ?? k), "Total"], rows: ctx.reportHouses.map((h) => { const a = causes.get(h) ?? {}; return [c(h, null, true), ...causeKeys.map((k) => num(a[k] ?? 0, 0)), c(fmtInt(Object.values(a).reduce((s, v) => s + v, 0)), null, true)]; }) },
          { type: "text", title: "Picos de mortalidade na semana", lines: peaks.length ? peaks : ["Nenhum dia com mortes acima de 2 × a mediana das 4 semanas anteriores."], style: peaks.length ? "bullets" : "plain" },
        ],
      },
    ],
  });

  // ---------------- 5. Avarias ----------------
  pages.push({
    n: 5,
    title: "Avarias",
    subtitle: "Trincados e quebrados por galpão",
    blocks: [...defectBlocks(ctx, [{ m: "qual.trincados", label: "Trincados", lane: "qual.avarias" }, { m: "qual.quebrados", label: "Quebrados", lane: "qual.quebrados" }], T), { type: "chart", spec: trendSpec(ctx, "qual.avarias", "Avarias (%) — tendência de 8 semanas", 2), height: 185 }],
  });

  // ---------------- 6. Sujos ----------------
  pages.push({
    n: 6,
    title: "Sujos de fezes e de sangue",
    blocks: [...defectBlocks(ctx, [{ m: "qual.sujos_fezes", label: "Fezes", lane: "qual.sujos_fezes" }, { m: "qual.sujos_sangue", label: "Sangue", lane: "qual.sujos_sangue" }], T), { type: "chart", spec: trendSpec(ctx, "qual.sujos", "Sujos (fezes + sangue, %) — tendência de 8 semanas", 2), height: 185 }],
  });

  // ---------------- 7. Ranking de galpões ----------------
  const rank = await getRanking(scope, null, ws);
  const comps = RANK_COMPONENTS.filter((x) => rank.includeMargin || x.key !== "marginPerBird");
  const rankRows: RRow[] = [];
  for (const p of ctx.byPhase) {
    const items = rank.items.filter((i) => p.houses.includes(i.house)).sort((a, b) => b.score - a.score);
    if (!items.length) continue;
    rankRows.push({ group: p.label });
    items.forEach((it, k) => rankRows.push([c(`${k + 1}º`, null, true), c(it.house, null, true), c(fmtNumber(it.score, 1), it.score >= 60 ? "good" : it.score < 40 ? "bad" : null, true), ...comps.map((x) => num(it.contributions[x.label], 1))]));
  }
  pages.push({
    n: 7,
    title: "Ranking de galpões",
    subtitle: "Nota composta de 0 a 100 (Parte 12.8), com a contribuição de cada componente, por fase",
    blocks: [
      { type: "table", columns: ["Posição", "Galpão", "Nota", ...comps.map((x) => `${x.label} (${fmtNumber(x.weight * 100, 0)}%)`)], align: ["l", "l"], rows: rankRows, note: rank.includeMargin ? "Contribuição = pontos do componente na nota (0 a 100 × peso)." : "Sem o componente de margem (perfil sem acesso financeiro); os demais pesos foram reescalados." },
      { type: "chart", spec: { kind: "hbar", title: "Nota composta", decimals: 1, xType: "category", categories: rank.items.map((i) => i.house), series: comps.map((x, k) => ({ name: x.label, type: "bar" as const, stack: "nota", color: ["#047857", "#0284c7", "#f59e0b", "#7c3aed", "#db2777"][k], data: rank.items.map((i) => [i.house, i.contributions[x.label] ?? 0] as [string, number]) })), height: 200 }, height: 200 },
    ],
  });

  // ---------------- 8. Ranking de linhagens ----------------
  const sr = await getStrainRanking(scope);
  pages.push({
    n: 8,
    title: "Ranking de linhagens",
    subtitle: "Parte 12.9 — lotes ativos e encerrados",
    blocks: [
      {
        type: "table",
        columns: ["Linhagem", "Lotes ativos", "Encerrados", "Desvio médio × curva (p.p.)", "Ovo/ave alojada aos 60 sem.", "n", "Mort. acumulada aos 60 sem.", "Trincados Pico", "Postura 1", "Postura 2", "Aviso"],
        align: ["l", "r", "r", "r", "r", "r", "r", "r", "r", "r", "l"],
        rows: [...sr].sort((a, b) => (b.oaa60.mean ?? 0) - (a.oaa60.mean ?? 0)).map((s) => [c(`${s.strain} — ${s.name}`, null, true), num(s.active, 0), num(s.closed, 0), delta(s.postureDev, 1, true), num(s.oaa60.mean, 1), num(s.oaa60.n, 0), num(s.mort60.mean, 2, "%"), num(s.cracked.pico, 2, "%"), num(s.cracked.postura1, 2, "%"), num(s.cracked.postura2, 2, "%"), c(s.warning ?? "—", s.warning ? "warn" : "muted")]),
        note: "Ovo por ave alojada e mortalidade aos 60 semanas = média dos lotes que chegaram a essa idade. Trincados por fase = média semanal dos lotes da linhagem.",
      },
      { type: "chart", spec: barSpec("Ovo por ave alojada aos 60 semanas", "ovos", 1, sr.map((s) => ({ x: s.strain, v: s.oaa60.mean, color: s.strain === "ALFA" ? "#0284c7" : s.strain === "BETA" ? "#b45309" : "#7c3aed" }))), height: 190 },
    ],
  });

  // ---------------- 9. Viabilidade econômica ----------------
  if (fin) {
    const frows = phaseRows(ctx, (h) => {
      const f = finBy.get(h);
      const gap = f?.posture != null && f.breakEven != null ? f.posture - f.breakEven : null;
      return [c(h, null, true), c(f?.flock ?? "—"), c(fmtBRL(f?.sum.receita, 0)), c(fmtBRL(f?.sum.custo, 0)), c(fmtBRL(f?.sum.margem, 0), (f?.sum.margem ?? 0) < 0 ? "bad" : "good", true), c(fmtBRL(f?.margemDz, 2), targetTone(f?.margemDz, T("fin.margem_dz"))), c(fmtBRL(f?.custoDz, 2)), num(f?.posture, 1, "%"), num(f?.breakEven, 1, "%"), delta(gap, 1, true, " p.p.")];
    });
    pages.push({
      n: 9,
      title: "Viabilidade econômica",
      badges: ["Estimado"],
      subtitle: "Margem por galpão e por lote; valores estimados com os preços e custos da beta",
      blocks: [
        { type: "table", columns: ["Galpão", "Lote", "Receita", "Custo", "Margem", "Margem/dz", "Custo/dz", "Postura real", "Postura de equilíbrio", "Folga"], align: ["l", "l"], rows: frows },
        { type: "chart", spec: barSpec("Margem da semana por galpão (R$)", "R$", 0, finance.filter((f) => ctx.reportHouses.includes(f.house)).map((f) => ({ x: f.house, v: f.sum.margem, color: f.sum.margem < 0 ? "#dc2626" : "#059669" })), 0), height: 190 },
      ],
    });
  } else {
    pages.push({ n: 9, title: "Viabilidade econômica", badges: ["Estimado"], blocks: [{ type: "text", lines: ["Seu perfil não tem acesso aos dados financeiros. Esta página aparece completa para diretoria e gerência."], style: "callout" }] });
  }

  // ---------------- 10. Lotes em observação ----------------
  const obs = alerts.filter((a) => a.house && a.topHypothesis && a.openedOn <= we && (OPEN.includes(a.status) || (a.closedOn ?? "") >= addDays(ws, -21)) && PROBLEM_CLASS[a.topHypothesis.code]);
  const byHouseRule = new Map<string, (typeof obs)[number]>();
  for (const a of obs) if (!byHouseRule.has(`${a.house}|${a.metricCode}`)) byHouseRule.set(`${a.house}|${a.metricCode}`, a);
  const alertHyps = await sql`select id, hypotheses from app.alerts where id in ${sql([...byHouseRule.values()].map((a) => a.id).concat(["00000000-0000-0000-0000-000000000000"]))}`;
  const hypBy = new Map(alertHyps.map((r) => [r.id, (r.hypotheses ?? []) as Array<{ code: string; name: string; confidence: string }>]));
  const classes: Array<"Estruturais" | "Sanitários" | "Nutricionais"> = ["Estruturais", "Sanitários", "Nutricionais"];
  pages.push({
    n: 10,
    title: "Lotes em observação",
    subtitle: "Problemas abertos ou das últimas 3 semanas, classificados pela hipótese principal do motor de causas",
    blocks: [
      {
        type: "grid",
        cols: 3,
        blocks: classes.map((cl) => ({
          type: "items" as const,
          title: cl,
          empty: "Nenhum problema nesta classe.",
          items: [...byHouseRule.values()]
            .filter((a) => PROBLEM_CLASS[a.topHypothesis!.code] === cl)
            .slice(0, 5)
            .map((a) => {
              const hs = (hypBy.get(a.id) ?? []).slice(0, 2);
              return {
                head: `${a.house} · ${ctx.flockOf(a.house!)?.code ?? ""} — ${a.title}`,
                tag: OPEN.includes(a.status) ? "em aberto" : `encerrado em ${dm(a.closedOn ?? a.lastSeenOn)}`,
                tone: OPEN.includes(a.status) ? ("warn" as const) : null,
                lines: [`Hipóteses: ${hs.map((x) => `${x.name} (${CONF_PT[x.confidence] ?? x.confidence})`).join("; ") || "—"}`, `Verificar: ${(kb.get(a.topHypothesis!.code)?.checks ?? []).slice(0, 3).join(", ")}`],
              };
            }),
        })),
      },
      { type: "text", lines: ["É uma hipótese, não um diagnóstico. A base de hipóteses é de demonstração e precisa de revisão veterinária antes de uso real."], style: "plain" },
    ],
  });

  // ---------------- 11. Eventos, alertas e decisões ----------------
  const events = (await listEvents({ houses: ctx.houses, from: ws, to: we })).filter((e) => e.startDate >= ws && e.startDate <= we);
  const resolved = alerts.filter((a) => a.closedOn && a.closedOn >= ws && a.closedOn <= we);
  const decisions = await sql`select text, owner_name, due_date::text as due, status from app.decisions where week_start = ${addDays(ws, -7)} order by created_at`;
  const ST: Record<string, string> = { aberta: "aberta", concluida: "concluída", cancelada: "cancelada" };
  pages.push({
    n: 11,
    title: "Eventos, alertas e decisões",
    blocks: [
      {
        type: "table",
        title: `Eventos da semana (${events.length})`,
        columns: ["Data", "Galpões", "Evento", "Certeza", "Retrato resumido"],
        align: ["l", "l", "l", "l", "l"],
        rows: events.slice(0, 7).map((e) => [c(dm(e.startDate)), c(e.houses.length > 3 ? `${e.houses.length} galpões` : e.houses.join(", ")), c(e.title), c(e.certainty), c(((e.details?.impact_summary as string) ?? "retrato em cálculo (janela aberta)").slice(0, 140))]),
        empty: "Nenhum evento registrado na semana.",
      },
      {
        type: "grid",
        cols: 3,
        blocks: [
          { type: "items", title: `Abertos no fim da semana (${openAtEnd.length})`, items: openAtEnd.slice(0, 6).map((a) => ({ head: `${a.house ?? "Granja"} · ${a.ruleCode}`, lines: [a.title], tone: SEV_RANK[a.severity] <= 1 ? ("bad" as const) : ("warn" as const) })), empty: "Nenhum." },
          { type: "items", title: `Resolvidos e descartados na semana (${resolved.length})`, items: resolved.slice(0, 6).map((a) => ({ head: `${a.house ?? "Granja"} · ${a.ruleCode} · ${a.status}`, lines: [a.title], tone: a.status === "resolvido" ? ("good" as const) : ("muted" as const) })), empty: "Nenhum." },
          { type: "items", title: "Decisões da reunião anterior", items: decisions.map((d) => ({ head: d.text, tag: ST[d.status] ?? d.status, tone: d.status === "concluida" ? ("good" as const) : d.status === "cancelada" ? ("muted" as const) : ("warn" as const), lines: [`${d.owner_name ?? "—"} · prazo ${d.due ? dmy(d.due) : "—"}`] })), empty: "Nenhuma decisão registrada na reunião anterior." },
        ],
      },
    ],
  });

  return { kind: "semanal", title: "Relatório Semanal", weekStart: ws, weekLabel: ctx.label, farmName: ctx.farmName, refDate: ctx.refDate, generatedAt: new Date().toISOString(), scopeNote, pages };
}
