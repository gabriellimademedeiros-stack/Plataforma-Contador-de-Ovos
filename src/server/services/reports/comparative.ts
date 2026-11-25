/** Relatório Comparativo — 9 páginas (Parte 15.2). */
import "server-only";
import { getSql } from "@/db/client";
import { addDays } from "@/lib/dates";
import { fmtNumber } from "@/lib/format";
import { METRIC_BY_CODE } from "@/engine/metrics/catalog";
import { conclusions } from "@/engine/text/report";
import type { Scope } from "@/server/permissions";
import { listAlerts, listEvents } from "@/server/repositories/marks";
import { aggregateCells, type Cell } from "@/server/services/metrics-query";
import type { ChartSpec } from "@/components/charts/types";
import type { RBlock, RCell, ReportModel, RPage, RRow } from "@/components/reports/types";
import { c, delta, dm, loadWeek, num, PHASES, type WeekCtx } from "./common";

interface Ind {
  m: string;
  label: string;
  d: number;
  hb: boolean | null;
  fin?: boolean;
}
const INDICATORS: Ind[] = [
  { m: "prod.postura", label: "Postura (%)", d: 1, hb: true },
  { m: "prod.desvio_interno", label: "Desvio interno (p.p.)", d: 1, hb: true },
  { m: "mort.diaria", label: "Mort. semana (%)", d: 2, hb: false },
  { m: "qual.trincados", label: "Trincados (%)", d: 2, hb: false },
  { m: "qual.quebrados", label: "Quebrados (%)", d: 2, hb: false },
  { m: "qual.sujos_fezes", label: "Sujos fezes (%)", d: 2, hb: false },
  { m: "qual.sujos_sangue", label: "Sangue (%)", d: 2, hb: false },
  { m: "nut.racao", label: "Ração (g/ave)", d: 1, hb: null },
  { m: "nut.conv_dz", label: "Conv. (kg/dz)", d: 3, hb: false },
  { m: "fin.margem_dz", label: "Margem/dz (R$)", d: 2, hb: true, fin: true },
];

/** Célula "valor (Δ)" com a cor da variação. */
function vd(v: number | null, ref: number | null, ind: Ind): RCell {
  if (v == null) return c("—");
  const d = ref != null ? v - ref : null;
  const dc = delta(d, ind.d, ind.hb, "", ind.d === 1 ? 0.3 : ind.d === 2 ? 0.05 : 0.005);
  return { v: `${fmtNumber(v, ind.d)}  ${d == null ? "" : `(${dc.v})`}`, tone: dc.tone };
}

function compareTable(ctx: WeekCtx, inds: Ind[], ref: (h: string, m: string) => number | null, farmRef: (m: string) => number | null): RBlock {
  const rows: RRow[] = ctx.houses.map((h) => [c(h, null, true), ...inds.map((i) => vd(ctx.val(h, i.m), ref(h, i.m), i))]);
  rows.push([c("Granja", null, true), ...inds.map((i) => ({ ...vd(ctx.farm(i.m), farmRef(i.m), i), bold: true }))]);
  return { type: "table", columns: ["Galpão", ...inds.map((i) => i.label)], rows, note: "Valor da semana e, entre parênteses, a diferença. Verde = melhorou; vermelho = piorou (pela direção de cada indicador). Granja = soma dos numeradores ÷ soma dos denominadores." };
}

export async function buildComparativeReport(scope: Scope, ws: string, scopeNote: string | null = null): Promise<ReportModel> {
  const ctx = await loadWeek(scope, ws);
  const sql = getSql();
  const we = addDays(ws, 6);
  const inds = INDICATORS.filter((i) => !i.fin || scope.canSeeFinance);
  const pages: RPage[] = [];

  // ---------------- 1. Resumo ----------------
  const moves = inds
    .filter((i) => i.hb != null)
    .map((i) => {
      const a = ctx.farm(i.m);
      const b = ctx.farm(i.m, ctx.prev);
      return { i, a, b, d: a != null && b != null ? a - b : null };
    })
    .filter((x) => x.d != null && Math.abs(x.d) > (x.i.d === 1 ? 0.1 : x.i.d === 2 ? 0.02 : 0.002));
  const improved = moves.filter((x) => (x.d! > 0) === x.i.hb).map((x) => ({ label: x.i.label.replace(/ \(.*\)/, ""), detail: `${fmtNumber(x.b, x.i.d)} → ${fmtNumber(x.a, x.i.d)}` }));
  const worsened = moves.filter((x) => (x.d! > 0) !== x.i.hb).map((x) => ({ label: x.i.label.replace(/ \(.*\)/, ""), detail: `${fmtNumber(x.b, x.i.d)} → ${fmtNumber(x.a, x.i.d)}` }));
  const houseMoves = ctx.houses
    .map((h) => ({ h, d: ctx.val(h, "prod.postura") != null && ctx.val(h, "prod.postura", ctx.prev) != null ? ctx.val(h, "prod.postura")! - ctx.val(h, "prod.postura", ctx.prev)! : null }))
    .filter((x): x is { h: string; d: number } => x.d != null)
    .sort((a, b) => a.d - b.d);
  pages.push({
    n: 1,
    title: "Resumo",
    subtitle: `${ctx.label} × semana anterior`,
    blocks: [
      {
        type: "grid",
        cols: 2,
        blocks: [
          { type: "items", title: "O que melhorou (granja)", items: improved.map((x) => ({ head: x.label, lines: [x.detail], tone: "good" as const })), empty: "Nenhum indicador melhorou de forma relevante." },
          { type: "items", title: "O que piorou (granja)", items: worsened.map((x) => ({ head: x.label, lines: [x.detail], tone: "bad" as const })), empty: "Nenhum indicador piorou de forma relevante." },
        ],
      },
      {
        type: "text",
        title: "Galpões que mais mudaram na postura",
        lines: [
          ...houseMoves.slice(0, 2).filter((x) => x.d < 0).map((x) => `${x.h}: ${fmtNumber(x.d, 1)} p.p. contra a semana anterior.`),
          ...houseMoves.slice(-2).filter((x) => x.d > 0).reverse().map((x) => `${x.h}: +${fmtNumber(x.d, 1)} p.p. contra a semana anterior.`),
        ],
        style: "bullets",
      },
    ],
  });

  // ---------------- 2 e 3 ----------------
  pages.push({ n: 2, title: "Semana × semana anterior", subtitle: "Todos os indicadores por galpão", blocks: [compareTable(ctx, inds, (h, m) => ctx.val(h, m, ctx.prev), (m) => ctx.farm(m, ctx.prev))] });
  const farmAvg4 = (m: string) => {
    const cells = [1, 2, 3, 4].flatMap((k) => ctx.houses.map((h) => ctx.row(h, m, addDays(ws, -7 * k)))).filter((x): x is NonNullable<typeof x> => !!x);
    return cells.length ? aggregateCells(m, cells, "granja").value : null;
  };
  pages.push({ n: 3, title: "Semana × média das 4 anteriores", subtitle: "Média de 4 semanas = soma dos numeradores ÷ soma dos denominadores", blocks: [compareTable(ctx, inds, (h, m) => ctx.avg4(h, m), farmAvg4)] });

  // ---------------- 4. Lote × lote anterior na mesma idade ----------------
  const pairs = ctx.houses
    .map((h) => {
      const cur = ctx.flockOf(h);
      const prevF = ctx.flocks.filter((f) => f.houseCode === h && f.startDate < (cur?.startDate ?? "")).sort((a, b) => (a.startDate < b.startDate ? 1 : -1))[0];
      return { h, cur, prevF, age: ctx.ageOf(h) };
    })
    .filter((p) => p.cur && p.prevF && p.age != null);
  const LM = ["prod.postura", "mort.acumulada", "qual.avarias", "qual.sujos", "prod.oaa", "prod.peso_ovo"];
  const prevRows = pairs.length
    ? await sql`select flock_id, age_week, metric_code, value from app.weekly_metrics where flock_id in ${sql(pairs.map((p) => p.prevF!.id))} and metric_code in ${sql(LM)} and days_count >= 7`
    : [];
  const pv = (flockId: string, age: number, m: string) => {
    const r = prevRows.find((x) => x.flock_id === flockId && Number(x.age_week) === age && x.metric_code === m);
    return r ? Number(r.value) : null;
  };
  const LMI: Array<{ m: string; label: string; d: number; hb: boolean | null }> = [
    { m: "prod.postura", label: "Postura (%)", d: 1, hb: true },
    { m: "mort.acumulada", label: "Mort. acum. (%)", d: 2, hb: false },
    { m: "qual.avarias", label: "Avarias (%)", d: 2, hb: false },
    { m: "prod.oaa", label: "Ovo/ave alojada", d: 1, hb: true },
  ];
  pages.push({
    n: 4,
    title: "Lote × lote anterior na mesma idade",
    subtitle: "Cada lote ativo contra o lote anterior do mesmo galpão na mesma semana de idade",
    blocks: [
      {
        type: "table",
        columns: ["Galpão", "Lote atual", "Lote anterior", "Idade (sem.)", ...LMI.flatMap((x) => [x.label, "anterior", "Δ"])],
        align: ["l", "l", "l", "r"],
        rows: pairs.map((p) => [
          c(p.h, null, true),
          c(`${p.cur!.code} ${p.cur!.strainCode.slice(0, 1)}${p.cur!.strainCode.slice(1).toLowerCase()}`),
          c(`${p.prevF!.code} ${p.prevF!.strainCode.slice(0, 1)}${p.prevF!.strainCode.slice(1).toLowerCase()}`),
          num(p.age, 0),
          ...LMI.flatMap((x) => {
            const a = ctx.val(p.h, x.m);
            const b = pv(p.prevF!.id, p.age!, x.m);
            return [num(a, x.d), num(b, x.d), delta(a != null && b != null ? a - b : null, x.d, x.hb)];
          }),
        ]),
        empty: "Nenhum galpão com lote anterior registrado.",
        note: "Lote anterior na mesma semana de idade (semanas completas), com a linhagem de cada lote. Sujos e peso do ovo aparecem na página 2.",
      },
    ],
  });

  // ---------------- 5. Linhagem × linhagem ----------------
  const visibleFlocks = ctx.flocks.filter((f) => ctx.houses.includes(f.houseCode));
  const curveRows = visibleFlocks.length
    ? await sql`select m.flock_id, m.age_week, m.value, m.numerator, m.denominator from app.weekly_metrics m where m.metric_code = 'prod.postura' and m.days_count >= 7 and m.flock_id in ${sql(visibleFlocks.map((f) => f.id))}`
    : [];
  const strainOf = new Map(visibleFlocks.map((f) => [f.id, f.strainCode]));
  const strains = Array.from(new Set(visibleFlocks.map((f) => f.strainCode))).sort();
  const ages = Array.from({ length: 100 - 18 + 1 }, (_, k) => k + 18);
  const curve = (s: string, a: number) => {
    const cells: Cell[] = curveRows.filter((r) => strainOf.get(r.flock_id) === s && Number(r.age_week) === a).map((r) => ({ value: Number(r.value), num: Number(r.numerator), den: Number(r.denominator) }));
    return cells.length ? aggregateCells("prod.postura", cells, "granja").value : null;
  };
  const SC: Record<string, string> = { ALFA: "#0284c7", BETA: "#b45309", GAMA: "#7c3aed" };
  const curveSpec: ChartSpec = {
    kind: "age",
    title: "Postura por semana de idade — média por linhagem (soma ÷ soma)",
    unit: "%",
    decimals: 1,
    xType: "value",
    xLabel: "Semana de idade",
    series: strains.flatMap((s) => [
      { name: s, color: SC[s] ?? "#334155", type: "line" as const, data: ages.map((a) => [a, curve(s, a)] as [number, number | null]).filter((p) => p[1] != null) },
      { name: `${s} — curva`, color: SC[s] ?? "#334155", type: "line" as const, dashed: true, width: 1, data: ages.map((a) => [a, ctx.std.week(s, "prod.postura", a)] as [number, number | null]).filter((p) => p[1] != null) },
    ]),
    height: 300,
  };
  const phaseMean = (s: string, lo: number, hi: number) => {
    const cells: Cell[] = curveRows.filter((r) => strainOf.get(r.flock_id) === s && Number(r.age_week) >= lo && Number(r.age_week) <= hi).map((r) => ({ value: Number(r.value), num: Number(r.numerator), den: Number(r.denominator) }));
    return cells.length ? aggregateCells("prod.postura", cells, "granja").value : null;
  };
  pages.push({
    n: 5,
    title: "Linhagem × linhagem",
    subtitle: "Curvas de postura por idade; tracejado = curva da linhagem",
    blocks: [
      { type: "chart", spec: curveSpec, height: 300 },
      { type: "table", columns: ["Linhagem", "Lotes", "Pico (26–57)", "Postura 1 (58–73)", "Postura 2 (≥ 74)"], rows: strains.map((s) => [c(s, null, true), num(visibleFlocks.filter((f) => f.strainCode === s).length, 0), num(phaseMean(s, 26, 57), 1, "%"), num(phaseMean(s, 58, 73), 1, "%"), num(phaseMean(s, 74, 200), 1, "%")]) },
    ],
  });

  // ---------------- 6. Galpão × galpão por fase ----------------
  const ordered = PHASES.flatMap((p) => ctx.reportHouses.filter((h) => ctx.phaseOf(h) === p.phase).map((h) => ({ h, p })));
  const PCOL: Record<string, string> = { pico: "#047857", postura1: "#0284c7", postura2: "#7c3aed" };
  const phaseBar = (m: string, title: string, d: number): ChartSpec => ({
    kind: "bar",
    title,
    unit: METRIC_BY_CODE[m]?.unit,
    decimals: d,
    xType: "category",
    categories: ordered.map((o) => o.h),
    series: [{ name: title, type: "bar", data: ordered.map((o) => [o.h, ctx.val(o.h, m)] as [string, number | null]), colors: ordered.map((o) => PCOL[o.p.phase]) }],
    height: 165,
  });
  pages.push({
    n: 6,
    title: "Galpão × galpão por fase",
    subtitle: "Barras por indicador dentro de cada fase (verde = Pico, azul = Postura 1, roxo = Postura 2)",
    blocks: [{ type: "grid", cols: 2, blocks: [{ type: "chart", spec: phaseBar("prod.postura", "Postura (%)", 1), height: 165 }, { type: "chart", spec: phaseBar("mort.diaria", "Mortalidade da semana (%)", 2), height: 165 }, { type: "chart", spec: phaseBar("qual.avarias", "Avarias (%)", 2), height: 165 }, { type: "chart", spec: phaseBar("qual.sujos", "Sujos (%)", 2), height: 165 }] }],
  });

  // ---------------- 7. Real × referências ----------------
  const HM: Array<{ m: string; label: string; hb: boolean }> = [
    { m: "prod.postura", label: "Postura", hb: true },
    { m: "prod.peso_ovo", label: "Peso do ovo", hb: true },
    { m: "mort.acumulada", label: "Mort. acum.", hb: false },
    { m: "qual.trincados", label: "Trincados", hb: false },
    { m: "qual.quebrados", label: "Quebrados", hb: false },
    { m: "qual.sujos_fezes", label: "Sujos fezes", hb: false },
    { m: "qual.sujos_sangue", label: "Sangue", hb: false },
    { m: "nut.racao", label: "Ração", hb: false },
    { m: "nut.agua", label: "Água", hb: false },
  ];
  const values: Array<[number, number, number | null]> = [];
  const devRows: RRow[] = [];
  ctx.reportHouses.forEach((h, yi) => {
    const f = ctx.flockOf(h);
    const age = ctx.ageOf(h);
    const row: RCell[] = [c(h, null, true)];
    HM.forEach((x, xi) => {
      const v = ctx.val(h, x.m);
      const ref = f && age != null ? (ctx.internal.medianAt(f.strainCode, x.m, age) ?? ctx.std.week(f.strainCode, x.m, age)) : null;
      const rel = v != null && ref ? ((v - ref) / Math.abs(ref)) * 100 : null;
      const oriented = rel == null ? null : x.hb ? rel : -rel;
      values.push([xi, yi, oriented == null ? null : Math.round(Math.max(-30, Math.min(30, oriented)) * 10) / 10]);
      row.push(v == null || ref == null ? c("—") : { v: `${v - ref >= 0 ? "+" : "−"}${fmtNumber(Math.abs(v - ref), x.m.startsWith("qual") || x.m === "mort.acumulada" ? 2 : 1)}`, tone: oriented == null || Math.abs(oriented) < 5 ? null : oriented > 0 ? "good" : "bad" });
    });
    devRows.push(row);
  });
  pages.push({
    n: 7,
    title: "Real × referências",
    subtitle: "Desvio contra o padrão interno (mediana dos lotes da granja na mesma idade; curva da linhagem quando há menos de 3 lotes)",
    blocks: [
      { type: "chart", spec: { kind: "heatmap", title: "Desvio relativo ao padrão (%) — positivo = melhor que o padrão", heat: { x: HM.map((x) => x.label), y: ctx.reportHouses, values, min: -20, max: 20, colors: ["#dc2626", "#fde68a", "#f8fafc", "#a7f3d0", "#059669"] }, series: [], decimals: 1, height: 230 }, height: 230 },
      { type: "table", columns: ["Galpão", ...HM.map((x) => `${x.label} (Δ)`)], rows: devRows, note: "Δ em unidades do indicador (p.p., g, g/ave/dia, mL/ave/dia). Cores quando o desvio passa de 5% do padrão." },
    ],
  });

  // ---------------- 8. Antes × depois dos eventos ----------------
  const evs = (await listEvents({ houses: ctx.houses, from: addDays(ws, -21), to: we })).filter((e) => e.startDate >= addDays(ws, -21) && e.startDate <= we && e.certainty !== "descartado");
  const imp = evs.length
    ? await sql`select i.event_id, h.code as house, i.metric_code, i.base_mean, i.effect_mean, i.delta_abs, i.delta_pct, i.z from app.event_impacts i join app.houses h on h.id = i.house_id where i.event_id in ${sql(evs.map((e) => e.id))} and i.is_control = false and i.z is not null`
    : [];
  const evRows: RRow[] = evs.slice(0, 9).map((e) => {
    const best = imp.filter((r) => r.event_id === e.id && ["prod.postura", "nut.racao", "nut.agua", "qual.trincados", "qual.sujos_fezes", "qual.sujos_sangue", "mort.diaria"].includes(r.metric_code)).sort((a, b) => Math.abs(Number(b.z)) - Math.abs(Number(a.z)))[0];
    const def = best ? METRIC_BY_CODE[best.metric_code] : null;
    const d = def?.decimals ?? 1;
    return [
      c(dm(e.startDate)),
      c(e.houses.length > 3 ? `${e.houses.length} galpões` : e.houses.join(", ")),
      c(e.title),
      c(best ? `${def?.short ?? best.metric_code} (${best.house})` : "—"),
      num(best ? Number(best.base_mean) : null, d),
      num(best ? Number(best.effect_mean) : null, d),
      best ? delta(Number(best.delta_abs), d, def?.direction === "maior_melhor" ? true : def?.direction === "menor_melhor" ? false : null) : c("—"),
      c(best ? fmtNumber(Number(best.z), 1) : "—", best && Math.abs(Number(best.z)) >= 2 ? "warn" : "muted"),
    ];
  });
  pages.push({
    n: 8,
    title: "Antes × depois dos eventos",
    subtitle: "Eventos das últimas 4 semanas; indicador com o maior efeito (|z|) do retrato de impacto",
    blocks: [
      { type: "table", columns: ["Início", "Galpões", "Evento", "Indicador", "Antes (base)", "Depois (efeito)", "Δ", "z"], align: ["l", "l", "l", "l"], rows: evRows, empty: "Nenhum evento nas últimas 4 semanas.", note: "|z| ≥ 2 indica impacto relevante. Δ desconta a tendência de idade da curva da linhagem (Parte 9)." },
      { type: "text", title: "Resumo dos retratos", lines: evs.slice(0, 4).map((e) => `${e.title}: ${((e.details?.impact_summary as string) ?? "retrato em cálculo (janela aberta)").slice(0, 180)}`), style: "bullets" },
    ],
  });

  // ---------------- 9. Conclusões ----------------
  const alerts = await listAlerts({ houses: ctx.houses, canSeeFinance: scope.canSeeFinance, statuses: ["aberto", "reconhecido", "em_investigacao"] });
  const fin = scope.canSeeFinance ? ctx.reportHouses.filter((h) => (ctx.val(h, "fin.margem") ?? 0) < 0) : [];
  const cc = conclusions({
    worsened: [...worsened, ...houseMoves.filter((x) => x.d < -1).map((x) => ({ label: `Postura do ${x.h}`, detail: `${fmtNumber(x.d, 1)} p.p. contra a semana anterior` }))],
    improved,
    criticalAlerts: alerts.filter((a) => ["critica", "alta"].includes(a.severity)).map((a) => `${a.house ?? "Granja"}: ${a.title}`),
    negativeMargin: fin,
    belowStandard: ctx.reportHouses.filter((h) => (ctx.val(h, "prod.desvio_interno") ?? 0) < -3),
  });
  pages.push({
    n: 9,
    title: "Conclusões",
    subtitle: "Pontos de atenção e sugestões para a reunião semanal (WBR)",
    blocks: [{ type: "grid", cols: 2, blocks: [{ type: "text", title: "Pontos de atenção", lines: cc.attention, style: "bullets" }, { type: "text", title: "Sugestões para o WBR", lines: cc.suggestions, style: "numbered" }] }],
  });

  return { kind: "comparativo", title: "Relatório Comparativo", weekStart: ws, weekLabel: ctx.label, farmName: ctx.farmName, refDate: ctx.refDate, generatedAt: new Date().toISOString(), scopeNote, pages };
}


