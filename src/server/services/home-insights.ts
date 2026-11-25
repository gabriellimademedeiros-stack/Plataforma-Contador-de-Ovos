import "server-only";
import { getSql } from "@/db/client";
import { addDays, weekLabel } from "@/lib/dates";
import { briefing } from "@/engine/text/briefing";
import type { Scope } from "@/server/permissions";
import { getRefDate } from "@/server/repositories/reference";
import { getForecast, getRanking } from "./finance";
import { readDaily, windowAggregate } from "./metrics-query";
import { getHeatWarning, getOpenAlerts, getPendingQuestions } from "./home-extra";

export async function getHomeBriefing(scope: Scope): Promise<{ lines: string[] }> {
  const refDate = await getRefDate();
  const rows = await readDaily(scope, { metrics: ["prod.ovos", "prod.postura"], from: addDays(refDate, -1), to: refDate });
  const day = (m: string, d: string) => windowAggregate(rows, m, d, d).total.value;
  const [alerts, heat, questions, ranking] = await Promise.all([getOpenAlerts(scope, 50), getHeatWarning(), getPendingQuestions(scope), getRanking(scope)]);
  const sql = getSql();
  const ids = [...scope.houseIds];
  const fresh = await sql`select title, severity from app.alerts where opened_on >= ${refDate} and (house_id is null or house_id in ${sql(ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])}) and rule_code <> 'P01' and (${scope.canSeeFinance} or rule_code <> 'A22')`;
  const worst = ranking.items.at(-1);
  const neg = scope.canSeeFinance ? alerts.filter((a) => a.ruleCode === "A22").map((a) => a.house!).filter(Boolean) : [];
  return {
    lines: briefing({
      date: refDate,
      eggs: day("prod.ovos", refDate),
      eggsPrev: day("prod.ovos", addDays(refDate, -1)),
      posture: day("prod.postura", refDate),
      posturePrev: day("prod.postura", addDays(refDate, -1)),
      newAlerts: fresh.map((r) => ({ title: r.title, severity: r.severity })),
      openAlerts: alerts.length,
      critical: alerts.filter((a) => a.severity === "critica").length,
      heatWarning: heat ? `Aviso preventivo: ${heat.title}. Galpões de maior risco: ${(heat.observed.houses ?? []).map((h) => h.code).join(", ")}.` : null,
      worstHouse: worst ? { house: worst.house, reason: `pior nota composta da ${weekLabel(ranking.weekStart).toLowerCase()} (${Math.round(worst.score)})` } : null,
      pendingQuestions: questions.length,
      marginNegative: neg,
    }),
  };
}

export async function getHomeRanking(scope: Scope) {
  const r = await getRanking(scope);
  return { weekLabel: weekLabel(r.weekStart), items: r.items.map((i) => ({ house: i.house, position: i.position, score: i.score, phase: i.phase })) };
}

export async function getHomeForecast(scope: Scope) {
  const f = await getForecast(scope, 4);
  return { weeks: f.farm.map((w) => ({ weekStart: w.weekStart, label: `Semana ${w.week} (a partir de ${w.weekStart.slice(8, 10)}/${w.weekStart.slice(5, 7)})`, boxes: Math.round(w.boxes), boxesLow: Math.round(w.boxesLow), boxesHigh: Math.round(w.boxesHigh) })) };
}
