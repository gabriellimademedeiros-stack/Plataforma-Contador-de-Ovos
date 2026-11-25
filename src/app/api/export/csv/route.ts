import { z } from "zod";
import { withScope } from "@/server/api";
import { toCsv } from "@/components/charts/csv";
import { querySeries, SeriesQuery } from "@/server/services/series-query";
import { listAlerts, listEvents } from "@/server/repositories/marks";
import { getRefDate } from "@/server/repositories/reference";
import { addDays } from "@/lib/dates";

const Tipo = z.enum(["serie", "alertas", "eventos"]).default("serie");

function csvResponse(name: string, body: string) {
  return new Response("﻿" + body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"` } });
}

/** Exportação CSV para o Excel em português: separador ";", UTF-8 com BOM, vírgula decimal, datas dd/mm/aaaa. */
export const GET = withScope(async (scope, req: Request) => {
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const tipo = Tipo.parse(sp.tipo);
  const houses = [...scope.houseCodes];
  if (tipo === "alertas") {
    const ref = await getRefDate();
    const a = await listAlerts({ houses, canSeeFinance: scope.canSeeFinance, from: sp.de ?? addDays(ref, -90), to: sp.ate ?? ref });
    return csvResponse("alertas", toCsv(["Aberto em", "Galpão", "Regra", "Título", "Severidade", "Situação", "Primeiro desvio", "Encerrado em", "Hipótese principal"], a.map((x) => [x.openedOn, x.house ?? "granja", x.ruleCode, x.title, x.severity, x.status, x.firstDeviationOn, x.closedOn, x.topHypothesis?.name ?? ""])));
  }
  if (tipo === "eventos") {
    const ref = await getRefDate();
    const e = await listEvents({ houses, from: sp.de ?? addDays(ref, -180), to: sp.ate ?? ref });
    return csvResponse("eventos", toCsv(["Início", "Fim", "Galpões", "Tipo", "Título", "Certeza", "Severidade", "Origem", "Retrato"], e.map((x) => [x.startDate, x.endDate, x.houses.join(", "), x.typeName, x.title, x.certainty, x.severity, x.source, (x.details?.impact_summary as string) ?? ""])));
  }
  const q = SeriesQuery.parse(sp);
  const r = await querySeries(scope, q);
  return csvResponse(`${r.metrica.codigo}-${r.periodo.inicio}-${r.periodo.fim}`, toCsv(["Galpão", q.eixo === "idade" ? (q.granularidade === "semana" ? "Semana de idade" : "Dia de vida") : q.granularidade === "semana" ? "Semana (início)" : "Data", "Idade (semanas)", `${r.metrica.nome} (${r.metrica.unidade})`, "Numerador", "Denominador"], r.linhas.map((l) => [l.galpao, l.x, l.idade_semanas, l.valor, l.numerador, l.denominador])));
});
