/** Consulta de séries para /api/metricas e /api/export/csv (métrica, galpões, período, granularidade, eixo). */
import "server-only";
import { z } from "zod";
import { addDays } from "@/lib/dates";
import { METRIC_BY_CODE } from "@/engine/metrics/catalog";
import type { Scope } from "@/server/permissions";
import { ApiError } from "@/server/api";
import { getRefDate } from "@/server/repositories/reference";
import { farmSeries, readDaily, readWeekly, scopedHouseCodes } from "./metrics-query";

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const SeriesQuery = z.object({
  metrica: z.string(),
  galpoes: z.string().nullish(),
  de: Day.nullish(),
  ate: Day.nullish(),
  granularidade: z.enum(["dia", "semana"]).default("dia"),
  eixo: z.enum(["data", "idade"]).default("data"),
  granja: z.enum(["sim", "nao"]).default("nao"),
});

export interface SeriesRow {
  galpao: string;
  x: string | number;
  idade_semanas: number | null;
  valor: number | null;
  numerador: number | null;
  denominador: number | null;
}

export async function querySeries(scope: Scope, q: z.infer<typeof SeriesQuery>) {
  const def = METRIC_BY_CODE[q.metrica];
  if (!def) throw new ApiError(400, `Métrica desconhecida: ${q.metrica}.`);
  const ref = await getRefDate();
  const to = q.ate && q.ate < ref ? q.ate : ref;
  const from = q.de ?? addDays(to, q.granularidade === "semana" ? -181 : -29);
  if (from > to) throw new ApiError(400, "Período inválido.");
  const houses = await scopedHouseCodes(scope, q.galpoes ? q.galpoes.split(",").map((s) => s.trim().toUpperCase()) : null);
  const rows: SeriesRow[] = [];
  if (q.granularidade === "semana") {
    const w = await readWeekly(scope, { houses, metrics: [q.metrica], from, to });
    for (const r of w) rows.push({ galpao: r.house, x: q.eixo === "idade" ? r.ageWeek : r.weekStart, idade_semanas: r.ageWeek, valor: r.value, numerador: r.num, denominador: r.den });
  } else {
    const d = await readDaily(scope, { houses, metrics: [q.metrica], from, to });
    for (const r of d) rows.push({ galpao: r.house, x: q.eixo === "idade" ? r.ageDays : r.date, idade_semanas: r.ageWeek, valor: r.value, numerador: r.num, denominador: r.den });
    if (q.granja === "sim") for (const p of farmSeries(d, q.metrica, from, to)) rows.push({ galpao: "granja", x: p.date, idade_semanas: null, valor: p.value, numerador: null, denominador: null });
  }
  return { metrica: { codigo: def.code, nome: def.name, unidade: def.unit, casas_decimais: def.decimals }, periodo: { inicio: from, fim: to }, granularidade: q.granularidade, eixo: q.eixo, galpoes: houses, linhas: rows };
}
