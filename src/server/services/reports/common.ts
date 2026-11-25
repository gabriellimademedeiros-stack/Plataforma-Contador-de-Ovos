/** Contexto de uma semana para os relatórios: métricas semanais de 8 semanas, lotes, padrões e agregações da granja. */
import "server-only";
import { addDays, weekLabel } from "@/lib/dates";
import type { Scope } from "@/server/permissions";
import { getFarm, getFlocks, getRefDate, currentFlockOf, type FlockRef } from "@/server/repositories/reference";
import { getInternalStandards, getStrainStandards } from "@/server/repositories/config";
import { aggregateCells, readWeekly, scopedHouseCodes, type WeeklyRowQ } from "@/server/services/metrics-query";
import { fmtNumber } from "@/lib/format";
import type { RCell, Tone } from "@/components/reports/types";

const LANES = ["quebrados", "avarias", "sujos_fezes", "sujos_sangue"].flatMap((k) => [1, 2].map((l) => `qual.${k}_pista${l}`));
export const REPORT_METRICS = [
  "prod.ovos", "prod.caixas", "prod.postura", "prod.desvio_interno", "prod.desvio_linhagem", "prod.oaa", "prod.peso_ovo", "prod.aproveitamento",
  "mort.diaria", "mort.acumulada", "mort.mortes", "mort.viabilidade",
  "qual.trincados", "qual.quebrados", "qual.avarias", "qual.sujos_fezes", "qual.sujos_sangue", "qual.sujos", "qual.trincados_pista1", "qual.trincados_pista2", "qual.razao_pistas", ...LANES,
  "nut.racao", "nut.agua", "nut.conv_dz", "amb.temp_max",
  "fin.receita", "fin.custo", "fin.margem", "fin.margem_dz", "fin.custo_dz", "fin.postura_equilibrio", "fin.margem_ave",
];

export interface WeekCtx {
  scope: Scope;
  ws: string;
  prev: string;
  label: string;
  refDate: string;
  farmName: string;
  flocks: FlockRef[];
  std: Awaited<ReturnType<typeof getStrainStandards>>;
  internal: Awaited<ReturnType<typeof getInternalStandards>>;
  houses: string[];
  rows: WeeklyRowQ[];
  row(h: string, m: string, w?: string): WeeklyRowQ | undefined;
  val(h: string, m: string, w?: string): number | null;
  farm(m: string, w?: string, houses?: string[]): number | null;
  avg4(h: string, m: string): number | null;
  flockOf(h: string): FlockRef | undefined;
  ageOf(h: string, w?: string): number | null;
  phaseOf(h: string): string | null;
  /** galpões no escopo do relatório (lotes com 26 semanas ou mais), por fase */
  byPhase: Array<{ phase: string; label: string; houses: string[] }>;
  reportHouses: string[];
}

export const PHASES = [
  { phase: "pico", label: "Pico (26–57 semanas)" },
  { phase: "postura1", label: "Postura 1 (58–73 semanas)" },
  { phase: "postura2", label: "Postura 2 (74 semanas ou mais)" },
];

export async function loadWeek(scope: Scope, ws: string, weeksBack = 8): Promise<WeekCtx> {
  const [refDate, farm, flocks, std, internal, houses] = await Promise.all([getRefDate(), getFarm(), getFlocks(), getStrainStandards(), getInternalStandards(), scopedHouseCodes(scope)]);
  const from = addDays(ws, -7 * weeksBack);
  const rows = await readWeekly(scope, { houses, metrics: REPORT_METRICS, from, to: ws });
  const idx = new Map(rows.map((r) => [`${r.house}|${r.metric}|${r.weekStart}`, r]));
  const row = (h: string, m: string, w = ws) => idx.get(`${h}|${m}|${w}`);
  const val = (h: string, m: string, w = ws) => row(h, m, w)?.value ?? null;
  const farmAgg = (m: string, w = ws, hs = houses) => {
    const cells = hs.map((h) => row(h, m, w)).filter((x): x is WeeklyRowQ => !!x);
    if (!cells.length) return null;
    return aggregateCells(m, cells, "granja").value;
  };
  const avg4 = (h: string, m: string) => {
    const cells = [1, 2, 3, 4].map((k) => row(h, m, addDays(ws, -7 * k))).filter((x): x is WeeklyRowQ => !!x);
    if (!cells.length) return null;
    // média das 4 semanas pela regra do catálogo (soma dos numeradores ÷ soma dos denominadores)
    return aggregateCells(m, cells, "granja").value;
  };
  const flockOf = (h: string) => currentFlockOf(flocks, h, addDays(ws, 6)) ?? undefined;
  const ageOf = (h: string, w = ws) => row(h, "prod.postura", w)?.ageWeek ?? row(h, "mort.diaria", w)?.ageWeek ?? null;
  const phaseOf = (h: string) => row(h, "prod.postura")?.phase ?? null;
  const reportHouses = houses.filter((h) => (ageOf(h) ?? 0) >= 26);
  const byPhase = PHASES.map((p) => ({ ...p, houses: reportHouses.filter((h) => phaseOf(h) === p.phase) })).filter((p) => p.houses.length);
  return {
    scope,
    ws,
    prev: addDays(ws, -7),
    label: weekLabel(ws),
    refDate,
    farmName: farm?.name ?? "Granja",
    flocks,
    std,
    internal,
    houses,
    rows,
    row,
    val,
    farm: farmAgg,
    avg4,
    flockOf,
    ageOf,
    phaseOf,
    byPhase,
    reportHouses,
  };
}

// ------------------------------------------------------------------------------------------------
// células formatadas
// ------------------------------------------------------------------------------------------------
export const c = (v: string, tone?: Tone, bold?: boolean): RCell => ({ v, tone, bold });
export const num = (v: number | null | undefined, d = 1, suffix = ""): RCell => c(v == null ? "—" : `${fmtNumber(v, d)}${suffix}`);

/** Variação com cor pela direção do indicador (maior é melhor ou menor é melhor). */
export function delta(v: number | null | undefined, d: number, higherBetter: boolean | null, suffix = "", threshold = 0): RCell {
  if (v == null || !Number.isFinite(v)) return c("—");
  const zero = Number(Math.abs(v).toFixed(d)) === 0;
  const s = zero ? fmtNumber(0, d) : `${v > 0 ? "+" : "−"}${fmtNumber(Math.abs(v), d)}`;
  let tone: Tone = null;
  if (!zero && higherBetter != null && Math.abs(v) > threshold) tone = (v > 0) === higherBetter ? "good" : "bad";
  return c(`${s}${suffix}`, tone);
}

/** Tom de um valor contra a meta (verde/amarelo/vermelho). */
export function targetTone(value: number | null | undefined, t: { greenMin: number | null; greenMax: number | null; yellowMin: number | null; yellowMax: number | null } | undefined): Tone {
  if (value == null || !t) return null;
  if (t.greenMin != null) return value >= t.greenMin ? "good" : t.yellowMin != null && value >= t.yellowMin ? "warn" : "bad";
  if (t.greenMax != null) return value <= t.greenMax ? "good" : t.yellowMax != null && value <= t.yellowMax ? "warn" : "bad";
  return null;
}

export const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
export const dmy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
