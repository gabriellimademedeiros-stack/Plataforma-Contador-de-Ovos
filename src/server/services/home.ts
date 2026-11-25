import "server-only";
import { addDays, ageWeeksDecimal } from "@/lib/dates";
import type { StatusColor } from "@/lib/colors";
import { statusFor, targetFor } from "@/engine/standards/targets";
import { delta, relativeDeviation, statusForRelativeDeviation } from "@/engine/metrics/derived";
import type { Scope } from "@/server/permissions";
import { getFlocks, getHouses, getRefDate, currentFlockOf } from "@/server/repositories/reference";
import { getStrainStandards, getTargets } from "@/server/repositories/config";
import { farmSeries, readDaily, windowAggregate, type DailyRow } from "./metrics-query";

export interface KpiCardData {
  key: string;
  title: string;
  metric: string;
  value: number | null;
  secondary?: string | null;
  unit: string;
  decimals: number;
  deltaPrev: number | null;
  deltaKind: "pp" | "pct" | "abs";
  reference: string | null;
  status: StatusColor;
  spark: Array<{ date: string; value: number | null }>;
  better: "up" | "down" | "none";
  finance?: boolean;
}

export interface HeatCell {
  metric: string;
  value: number | null;
  status: StatusColor;
  tab: string;
}

export interface HeatRow {
  house: string;
  flock: string | null;
  ageWeek: number | null;
  cells: HeatCell[];
}

export const HEAT_COLUMNS: Array<{ key: string; label: string; unit: string; decimals: number; tab: string; finance?: boolean }> = [
  { key: "prod.desvio_interno", label: "Desvio de postura", unit: "p.p.", decimals: 1, tab: "producao" },
  { key: "mort.diaria", label: "Mortalidade (7 dias)", unit: "%", decimals: 2, tab: "sanidade" },
  { key: "qual.trincados", label: "Trincados", unit: "%", decimals: 2, tab: "qualidade" },
  { key: "qual.sujos_fezes", label: "Sujos de fezes", unit: "%", decimals: 2, tab: "qualidade" },
  { key: "qual.sujos_sangue", label: "Sangue", unit: "%", decimals: 2, tab: "qualidade" },
  { key: "desvio_racao", label: "Desvio de ração", unit: "%", decimals: 1, tab: "nutricao" },
  { key: "desvio_agua", label: "Desvio de água", unit: "%", decimals: 1, tab: "nutricao" },
  { key: "amb.temp_max", label: "Temp. máxima", unit: "°C", decimals: 1, tab: "ambiencia" },
  { key: "fin.margem_dz", label: "Margem/dz", unit: "R$", decimals: 2, tab: "financeiro", finance: true },
];

const CARD_METRICS = [
  "prod.ovos",
  "prod.postura",
  "prod.desvio_interno",
  "prod.aproveitamento",
  "qual.avarias",
  "qual.sujos",
  "mort.diaria",
  "nut.racao",
  "fin.margem",
  "fin.margem_dz",
  "qual.trincados",
  "qual.sujos_fezes",
  "qual.sujos_sangue",
  "nut.agua",
  "amb.temp_max",
];

export async function getHomeData(scope: Scope) {
  const refDate = await getRefDate();
  const from = addDays(refDate, -36);
  const metrics = CARD_METRICS.filter((m) => scope.canSeeFinance || !m.startsWith("fin."));
  const [rows, targets, houses, flocks, strainStd] = await Promise.all([
    readDaily(scope, { metrics, from, to: refDate }),
    getTargets(),
    getHouses(),
    getFlocks(),
    getStrainStandards(),
  ]);
  const visible = houses.filter((h) => scope.houseCodes.has(h.code)).map((h) => h.code);
  const sparkFrom = addDays(refDate, -29);
  const day = (m: string, d: string) => windowAggregate(rows, m, d, d).total.value;
  const week = (m: string, end: string) => windowAggregate(rows, m, addDays(end, -6), end).total.value;
  const prev7 = (m: string) => windowAggregate(rows, m, addDays(refDate, -7), addDays(refDate, -1)).total.value;
  const st = (m: string, v: number | null) => statusFor(v, targetFor(targets, m));

  const cards: KpiCardData[] = [];
  const eggs = day("prod.ovos", refDate);
  cards.push({ key: "producao", title: "Produção de ontem", metric: "prod.ovos", value: eggs, secondary: eggs != null ? `${Math.round(eggs / 360).toLocaleString("pt-BR")} caixas` : null, unit: "ovos", decimals: 0, deltaPrev: delta(eggs, prev7("prod.ovos") != null ? (windowAggregate(rows, "prod.ovos", addDays(refDate, -7), addDays(refDate, -1)).total.value ?? 0) / 7 : null), deltaKind: "abs", reference: "vs média diária dos 7 dias anteriores", status: "cinza", spark: farmSeries(rows, "prod.ovos", sparkFrom, refDate), better: "up" });
  const post = day("prod.postura", refDate);
  const dvi = day("prod.desvio_interno", refDate);
  cards.push({ key: "postura", title: "Postura média ponderada", metric: "prod.postura", value: post, unit: "%", decimals: 1, deltaPrev: delta(post, prev7("prod.postura")), deltaKind: "pp", reference: dvi != null ? `${dvi >= 0 ? "+" : "−"}${Math.abs(dvi).toFixed(1).replace(".", ",")} p.p. × padrão interno` : null, status: st("prod.desvio_interno", dvi), spark: farmSeries(rows, "prod.postura", sparkFrom, refDate), better: "up" });
  const apr = day("prod.aproveitamento", refDate);
  cards.push({ key: "aproveitamento", title: "Aproveitamento comercial", metric: "prod.aproveitamento", value: apr, unit: "%", decimals: 1, deltaPrev: delta(apr, prev7("prod.aproveitamento")), deltaKind: "pp", reference: "meta ≥ 95%", status: st("prod.aproveitamento", apr), spark: farmSeries(rows, "prod.aproveitamento", sparkFrom, refDate), better: "up" });
  const av = day("qual.avarias", refDate);
  cards.push({ key: "avarias", title: "Avarias (trincados + quebrados)", metric: "qual.avarias", value: av, unit: "%", decimals: 2, deltaPrev: delta(av, prev7("qual.avarias")), deltaKind: "pp", reference: "trincados: meta ≤ 2,5%", status: st("qual.trincados", day("qual.trincados", refDate)), spark: farmSeries(rows, "qual.avarias", sparkFrom, refDate), better: "down" });
  const sj = day("qual.sujos", refDate);
  cards.push({ key: "sujos", title: "Sujos (fezes + sangue)", metric: "qual.sujos", value: sj, unit: "%", decimals: 2, deltaPrev: delta(sj, prev7("qual.sujos")), deltaKind: "pp", reference: "fezes ≤ 1,8% · sangue ≤ 0,5%", status: worst([st("qual.sujos_fezes", day("qual.sujos_fezes", refDate)), st("qual.sujos_sangue", day("qual.sujos_sangue", refDate))]), spark: farmSeries(rows, "qual.sujos", sparkFrom, refDate), better: "down" });
  const mw = week("mort.diaria", refDate);
  const mwPrev = week("mort.diaria", addDays(refDate, -7));
  cards.push({ key: "mortalidade", title: "Mortalidade da semana", metric: "mort.diaria", value: mw, unit: "%", decimals: 2, deltaPrev: delta(mw, mwPrev), deltaKind: "pp", reference: "últimos 7 dias · meta ≤ 0,10%", status: st("mort.diaria", mw), spark: farmSeries(rows, "mort.diaria", sparkFrom, refDate), better: "down" });
  const rc = day("nut.racao", refDate);
  cards.push({ key: "racao", title: "Ração por ave", metric: "nut.racao", value: rc, unit: "g/ave/dia", decimals: 1, deltaPrev: delta(rc, prev7("nut.racao")), deltaKind: "abs", reference: "vs média dos 7 dias anteriores", status: "cinza", spark: farmSeries(rows, "nut.racao", sparkFrom, refDate), better: "none" });
  if (scope.canSeeFinance) {
    const mg = week("fin.margem", refDate);
    const mgPrev = week("fin.margem", addDays(refDate, -7));
    const mdz = week("fin.margem_dz", refDate);
    cards.push({ key: "margem", title: "Margem da semana (Estimado)", metric: "fin.margem", value: mg, secondary: mdz != null ? `R$ ${mdz.toFixed(2).replace(".", ",")}/dz` : null, unit: "R$", decimals: 0, deltaPrev: delta(mg, mgPrev), deltaKind: "abs", reference: "últimos 7 dias · meta ≥ R$ 0,20/dz", status: st("fin.margem_dz", mdz), spark: farmSeries(rows, "fin.margem", sparkFrom, refDate), better: "up", finance: true });
  }

  // Mapa de calor galpões × indicadores (últimos 7 dias)
  const wFrom = addDays(refDate, -6);
  const heat: HeatRow[] = [];
  for (const h of visible) {
    const fl = currentFlockOf(flocks, h, refDate);
    const cells: HeatCell[] = [];
    for (const col of HEAT_COLUMNS) {
      if (col.finance && !scope.canSeeFinance) continue;
      let value: number | null = null;
      let status: StatusColor = "cinza";
      if (col.key === "desvio_racao" || col.key === "desvio_agua") {
        const m = col.key === "desvio_racao" ? "nut.racao" : "nut.agua";
        value = relDevVsStrain(rows, m, h, wFrom, refDate, fl, strainStd);
        status = statusForRelativeDeviation(value);
      } else {
        value = windowAggregate(rows, col.key, wFrom, refDate, [h]).byHouse.get(h)?.value ?? null;
        status = st(col.key, value);
      }
      cells.push({ metric: col.key, value, status, tab: col.tab });
    }
    heat.push({ house: h, flock: fl?.code ?? null, ageWeek: fl ? Math.floor(ageWeeksDecimal(refDate, fl.hatchDate)) : null, cells });
  }
  return { refDate, cards, heat, columns: HEAT_COLUMNS.filter((c) => !c.finance || scope.canSeeFinance) };
}

function relDevVsStrain(rows: DailyRow[], metric: string, house: string, from: string, to: string, fl: { strainCode: string; hatchDate: string } | undefined, std: Awaited<ReturnType<typeof getStrainStandards>>) {
  if (!fl) return null;
  const v = windowAggregate(rows, metric, from, to, [house]).byHouse.get(house)?.value ?? null;
  const s = std.at(fl.strainCode, metric, ageWeeksDecimal(addDays(to, -3), fl.hatchDate));
  return relativeDeviation(v, s);
}

function worst(list: StatusColor[]): StatusColor {
  if (list.includes("vermelho")) return "vermelho";
  if (list.includes("amarelo")) return "amarelo";
  if (list.includes("verde")) return "verde";
  return "cinza";
}
