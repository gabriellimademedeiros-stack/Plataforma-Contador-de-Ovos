/**
 * Comparativos (Parte 14.16): galpões, lotes, linhagens, períodos e antes × depois de um evento.
 * Agregações pela regra do catálogo (soma ÷ soma); estatística simples para o aviso "diferença pequena demais".
 */
import "server-only";
import { z } from "zod";
import { getSql } from "@/db/client";
import { addDays, diffDays } from "@/lib/dates";
import { HOUSE_COLORS } from "@/lib/colors";
import { METRIC_BY_CODE, isFinanceMetric } from "@/engine/metrics/catalog";
import { stdev } from "@/engine/stats";
import { PermissionError, type Scope } from "@/server/permissions";
import { ApiError } from "@/server/api";
import { getFlocks, getRefDate, currentFlockOf } from "@/server/repositories/reference";
import { getStrainStandards } from "@/server/repositories/config";
import { aggregateCells, readDaily, readWeekly, windowAggregate, type Cell } from "@/server/services/metrics-query";
import type { ChartSpec } from "@/components/charts/types";

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const ComparisonParams = z.object({
  tipo: z.enum(["galpoes", "lotes", "linhagens", "periodos", "evento"]),
  itens: z.array(z.string()).default([]),
  metrica: z.string(),
  eixo: z.enum(["data", "idade", "dias_evento"]).default("data"),
  inicio: Day.nullish(),
  fim: Day.nullish(),
  /** períodos: galpão de referência (vazio = granja) */
  galpao: z.string().nullish(),
  /** antes × depois: id do evento */
  evento: z.string().uuid().nullish(),
});
export type ComparisonParamsT = z.infer<typeof ComparisonParams>;

export interface ComparisonRow {
  item: string;
  n: number;
  media: number | null;
  dp: number | null;
  diferenca: number | null;
  detalhe?: string;
}

export interface ComparisonResult {
  titulo: string;
  spec: ChartSpec;
  tabela: ComparisonRow[];
  avisos: string[];
  unidade: string;
  decimais: number;
}

const PALETTE = ["#047857", "#0284c7", "#b45309", "#7c3aed", "#db2777", "#0891b2", "#65a30d", "#dc2626"];
const STRAIN_COLORS: Record<string, string> = { ALFA: "#0284c7", BETA: "#b45309", GAMA: "#7c3aed" };

function finishTable(rows: ComparisonRow[], avisos: string[], decimals: number): ComparisonRow[] {
  const base = rows[0];
  for (const r of rows) r.diferenca = base && r.media != null && base.media != null ? r.media - base.media : null;
  for (const r of rows.slice(1)) {
    if (r.media == null || base?.media == null || r.dp == null || base.dp == null || r.n < 2 || base.n < 2) continue;
    const se = Math.sqrt((r.dp * r.dp) / r.n + (base.dp * base.dp) / base.n);
    if (Math.abs(r.media - base.media) < 2 * se) avisos.push(`${r.item} × ${base.item}: diferença pequena demais para concluir (${Math.abs(r.media - base.media).toFixed(decimals).replace(".", ",")} < 2 erros-padrão)`);
  }
  return rows;
}

export async function runComparison(scope: Scope, p: ComparisonParamsT): Promise<ComparisonResult> {
  const def = METRIC_BY_CODE[p.metrica];
  if (!def) throw new ApiError(400, "Métrica desconhecida.");
  if (isFinanceMetric(p.metrica) && !scope.canSeeFinance) throw new PermissionError("Seu perfil não tem acesso a dados financeiros.");
  const refDate = await getRefDate();
  const to = p.fim && p.fim <= refDate ? p.fim : refDate;
  const from = p.inicio ?? addDays(to, -89);
  const avisos: string[] = [];
  const unit = def.unit;
  const d = def.decimals;
  const allowedHouse = (h: string) => scope.houseCodes.has(h);

  // ---------------- galpões ----------------
  if (p.tipo === "galpoes") {
    const houses = p.itens.filter(allowedHouse).slice(0, 8);
    if (houses.length < 2) throw new ApiError(400, "Escolha pelo menos dois galpões que você pode ver.");
    const flocks = await getFlocks();
    const ages = houses.map((h) => {
      const f = currentFlockOf(flocks, h, to);
      return f ? Math.floor(diffDays(f.hatchDate, to) / 7) : null;
    });
    if (ages.every((a) => a != null) && Math.max(...(ages as number[])) - Math.min(...(ages as number[])) >= 4) avisos.push(`idades diferentes (${houses.map((h, i) => `${h}: ${ages[i]} semanas`).join(", ")}): compare com cuidado; o ideal é comparar lotes na mesma semana de idade (tipo "lotes")`);
    if (p.eixo === "idade") {
      const w = await readWeekly(scope, { houses, metrics: [p.metrica], from, to });
      const spec: ChartSpec = { kind: "age", title: def.name, unit, decimals: d, xType: "value", xLabel: "Semana de idade", series: houses.map((h) => ({ name: h, color: HOUSE_COLORS[h], type: "line" as const, data: w.filter((r) => r.house === h && r.daysCount >= 7).map((r) => [r.ageWeek, r.value] as [number, number | null]) })) };
      const rows = houses.map((h) => {
        const cells = w.filter((r) => r.house === h && r.daysCount >= 7);
        return { item: h, n: cells.length, media: cells.length ? aggregateCells(p.metrica, cells, "granja").value : null, dp: stdev(cells.map((c) => c.value)), diferenca: null };
      });
      return { titulo: `${def.name} por semana de idade`, spec, tabela: finishTable(rows, avisos, d), avisos, unidade: unit, decimais: d };
    }
    const rows = await readDaily(scope, { houses, metrics: [p.metrica], from, to });
    const agg = windowAggregate(rows, p.metrica, from, to, houses);
    const spec: ChartSpec = { kind: "timeseries", title: def.name, unit, decimals: d, series: houses.map((h) => ({ name: h, color: HOUSE_COLORS[h], type: "line" as const, data: rows.filter((r) => r.house === h).map((r) => [r.date, r.value] as [string, number | null]) })) };
    const tab = houses.map((h) => {
      const vals = rows.filter((r) => r.house === h && r.value != null);
      return { item: h, n: vals.length, media: agg.byHouse.get(h)?.value ?? null, dp: stdev(vals.map((v) => v.value)), diferenca: null };
    });
    return { titulo: `${def.name} — galpões`, spec, tabela: finishTable(tab, avisos, d), avisos, unidade: unit, decimais: d };
  }

  // ---------------- lotes (sempre por idade) ----------------
  if (p.tipo === "lotes") {
    const flocks = await getFlocks();
    const chosen = p.itens.map((c) => flocks.find((f) => f.code === c.toUpperCase())).filter((f): f is NonNullable<typeof f> => !!f);
    const visible = chosen.filter((f) => allowedHouse(f.houseCode));
    if (visible.length < chosen.length) avisos.push("lotes de galpões fora do seu acesso foram ignorados");
    if (visible.length < 2) throw new ApiError(400, "Escolha pelo menos dois lotes.");
    const sql = getSql();
    const rows = await sql`select flock_id, age_week, value, numerator, denominator from app.weekly_metrics where metric_code = ${p.metrica} and days_count >= 7 and flock_id in ${sql(visible.map((f) => f.id))} order by age_week`;
    // faixa de idade em comum para a tabela (comparação justa)
    const ranges = visible.map((f) => rows.filter((r) => r.flock_id === f.id).map((r) => Number(r.age_week)));
    const lo = Math.max(...ranges.map((r) => (r.length ? Math.min(...r) : 999)));
    const hi = Math.min(...ranges.map((r) => (r.length ? Math.max(...r) : -1)));
    const std = await getStrainStandards();
    const strains = Array.from(new Set(visible.map((f) => f.strainCode)));
    const spec: ChartSpec = {
      kind: "age",
      title: `${def.name} por semana de idade`,
      unit,
      decimals: d,
      xType: "value",
      xLabel: "Semana de idade",
      series: [
        ...visible.map((f, i) => ({ name: `${f.code} (${f.houseCode}, ${f.strainCode})`, color: PALETTE[i % PALETTE.length], type: "line" as const, data: rows.filter((r) => r.flock_id === f.id).map((r) => [Number(r.age_week), Number(r.value)] as [number, number | null]) })),
        ...strains.map((s) => ({ name: `Curva ${s}`, color: "#374151", dashed: true, width: 1, type: "line" as const, data: Array.from({ length: 83 }, (_, k) => k + 18).map((a) => [a, std.week(s, p.metrica, a)] as [number, number | null]).filter((x) => x[1] != null) })),
      ],
    };
    if (lo > hi) avisos.push("os lotes não têm semanas de idade em comum; a tabela usa todas as semanas de cada lote");
    const tab = visible.map((f) => {
      const cells: Cell[] = rows.filter((r) => r.flock_id === f.id && (lo > hi || (Number(r.age_week) >= lo && Number(r.age_week) <= hi))).map((r) => ({ value: Number(r.value), num: r.numerator == null ? null : Number(r.numerator), den: r.denominator == null ? null : Number(r.denominator) }));
      return { item: `${f.code} (${f.houseCode}, ${f.strainCode})`, n: cells.length, media: cells.length ? aggregateCells(p.metrica, cells, "granja").value : null, dp: stdev(cells.map((c) => c.value)), diferenca: null, detalhe: lo <= hi ? `semanas ${lo} a ${hi}` : undefined };
    });
    if (new Set(visible.map((f) => f.strainCode)).size > 1) avisos.push("linhagens diferentes: parte da diferença pode ser da linhagem");
    return { titulo: `${def.name} — lote × lote na mesma idade${lo <= hi ? ` (semanas ${lo} a ${hi} na tabela)` : ""}`, spec, tabela: finishTable(tab, avisos, d), avisos, unidade: unit, decimais: d };
  }

  // ---------------- linhagens ----------------
  if (p.tipo === "linhagens") {
    const flocks = (await getFlocks()).filter((f) => allowedHouse(f.houseCode));
    const strains = (p.itens.length ? p.itens.map((s) => s.toUpperCase()) : Array.from(new Set(flocks.map((f) => f.strainCode)))).filter((s) => flocks.some((f) => f.strainCode === s));
    if (strains.length < 2) throw new ApiError(400, "Escolha pelo menos duas linhagens.");
    const sql = getSql();
    const rows = await sql`select flock_id, age_week, value, numerator, denominator from app.weekly_metrics where metric_code = ${p.metrica} and days_count >= 7 and flock_id in ${sql(flocks.map((f) => f.id))}`;
    const strainOf = new Map(flocks.map((f) => [f.id, f.strainCode]));
    const cellsOf = (s: string, a?: number) => rows.filter((r) => strainOf.get(r.flock_id) === s && (a == null || Number(r.age_week) === a)).map((r) => ({ value: Number(r.value), num: r.numerator == null ? null : Number(r.numerator), den: r.denominator == null ? null : Number(r.denominator) }));
    const ages = Array.from({ length: 83 }, (_, k) => k + 18);
    const spec: ChartSpec = { kind: "age", title: `${def.name} por semana de idade — média por linhagem`, unit, decimals: d, xType: "value", xLabel: "Semana de idade", series: strains.map((s) => ({ name: s, color: STRAIN_COLORS[s] ?? "#334155", type: "line" as const, data: ages.map((a) => { const c = cellsOf(s, a); return [a, c.length ? aggregateCells(p.metrica, c, "granja").value : null] as [number, number | null]; }).filter((x) => x[1] != null) })) };
    const tab = strains.map((s) => {
      const c = cellsOf(s);
      const n = flocks.filter((f) => f.strainCode === s).length;
      if (n < 3) avisos.push(`${s}: comparação pouco robusta (menos de 3 lotes)`);
      return { item: s, n: c.length, media: c.length ? aggregateCells(p.metrica, c, "granja").value : null, dp: stdev(c.map((x) => x.value)), diferenca: null, detalhe: `${n} lote(s)` };
    });
    avisos.push("média por linhagem = soma dos numeradores ÷ soma dos denominadores de todas as semanas dos lotes");
    return { titulo: `${def.name} — linhagens`, spec, tabela: finishTable(tab, avisos, d), avisos, unidade: unit, decimais: d };
  }

  // ---------------- períodos ----------------
  if (p.tipo === "periodos") {
    const periods = p.itens
      .map((s) => s.split("/"))
      .filter((x) => x.length === 2 && /^\d{4}-\d{2}-\d{2}$/.test(x[0]) && /^\d{4}-\d{2}-\d{2}$/.test(x[1]) && x[0] <= x[1])
      .slice(0, 4);
    if (periods.length < 2) throw new ApiError(400, "Informe pelo menos dois períodos (início e fim).");
    const house = p.galpao && allowedHouse(p.galpao) ? p.galpao : null;
    const houses = house ? [house] : [...scope.houseCodes];
    const series: ChartSpec["series"] = [];
    const tab: ComparisonRow[] = [];
    for (const [i, [a, b]] of periods.entries()) {
      const rows = await readDaily(scope, { houses, metrics: [p.metrica], from: a, to: b });
      const w = windowAggregate(rows, p.metrica, a, b, houses);
      const days = Array.from({ length: diffDays(a, b) + 1 }, (_, k) => addDays(a, k));
      const daily = days.map((dd) => {
        const cells = rows.filter((r) => r.date === dd);
        return cells.length ? aggregateCells(p.metrica, cells, "granja").value : null;
      });
      const label = `${a.slice(8, 10)}/${a.slice(5, 7)}/${a.slice(2, 4)} a ${b.slice(8, 10)}/${b.slice(5, 7)}/${b.slice(2, 4)}`;
      series.push({ name: label, color: PALETTE[i], type: "line", data: daily.map((v, k) => [k + 1, v] as [number, number | null]) });
      tab.push({ item: label, n: daily.filter((v) => v != null).length, media: house ? (w.byHouse.get(house)?.value ?? null) : w.total.value, dp: stdev(daily), diferenca: null });
    }
    const spec: ChartSpec = { kind: "timeseries", title: `${def.name} — ${house ?? "granja"}`, unit, decimals: d, xType: "value", xLabel: "Dia do período", series };
    return { titulo: `${def.name} — períodos (${house ?? "granja"})`, spec, tabela: finishTable(tab, avisos, d), avisos, unidade: unit, decimais: d };
  }

  // ---------------- antes × depois de um evento ----------------
  if (!p.evento) throw new ApiError(400, "Escolha o evento.");
  const sql = getSql();
  const [ev] = await sql`select e.id, e.title, (e.starts_at at time zone 'America/Fortaleza' - interval '6 hours')::date::text as d0, array_agg(h.code order by h.code) as houses
    from app.events e join app.event_scopes s on s.event_id = e.id join app.houses h on h.id = s.house_id where e.id = ${p.evento} group by e.id`;
  if (!ev) throw new ApiError(400, "Evento não encontrado.");
  const houses = (ev.houses as string[]).filter(allowedHouse).slice(0, 8);
  if (!houses.length) throw new PermissionError("Você não tem acesso aos galpões desse evento.");
  const before = 14;
  const after = 21;
  const a = addDays(ev.d0, -before);
  const b = addDays(ev.d0, after) > refDate ? refDate : addDays(ev.d0, after);
  const rows = await readDaily(scope, { houses, metrics: [p.metrica], from: a, to: b });
  const spec: ChartSpec = {
    kind: "timeseries",
    title: `${def.name} — dias em relação ao evento`,
    unit,
    decimals: d,
    xType: "value",
    xLabel: "Dias em relação ao início do evento (0 = início)",
    series: houses.map((h) => ({ name: h, color: HOUSE_COLORS[h], type: "line" as const, data: rows.filter((r) => r.house === h).map((r) => [diffDays(ev.d0, r.date), r.value] as [number, number | null]) })),
    refLines: [{ name: "Início", x: 0, dashed: true, color: "#dc2626" }],
  };
  const tab: ComparisonRow[] = [];
  for (const h of houses) {
    const pre = windowAggregate(rows, p.metrica, a, addDays(ev.d0, -1), [h]).byHouse.get(h)?.value ?? null;
    const post = windowAggregate(rows, p.metrica, ev.d0, b, [h]).byHouse.get(h)?.value ?? null;
    const preVals = rows.filter((r) => r.house === h && r.date < ev.d0).map((r) => r.value);
    const postVals = rows.filter((r) => r.house === h && r.date >= ev.d0).map((r) => r.value);
    tab.push({ item: `${h} — antes (${before} dias)`, n: preVals.filter((v) => v != null).length, media: pre, dp: stdev(preVals), diferenca: null });
    const row: ComparisonRow = { item: `${h} — depois (até ${diffDays(ev.d0, b)} dias)`, n: postVals.filter((v) => v != null).length, media: post, dp: stdev(postVals), diferenca: pre != null && post != null ? post - pre : null };
    const sd = stdev(preVals);
    const n1 = preVals.filter((v) => v != null).length;
    const n2 = postVals.filter((v) => v != null).length;
    if (pre != null && post != null && sd != null && n1 > 1 && n2 > 1) {
      const se = Math.sqrt((sd * sd) / n1 + ((stdev(postVals) ?? sd) ** 2) / n2);
      if (Math.abs(post - pre) < 2 * se) avisos.push(`${h}: diferença pequena demais para concluir`);
    }
    tab.push(row);
  }
  avisos.push("antes × depois sem descontar a idade; o retrato de impacto do evento desconta a tendência de idade e usa galpões de controle");
  return { titulo: `${def.name} — antes × depois: ${ev.title}`, spec, tabela: tab, avisos, unidade: unit, decimais: d };
}
