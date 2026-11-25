/** Filtros globais guardados na URL (Parte 14.1): período, eixo e galpão. */
import { addDays, isISODate } from "@/lib/dates";

export type PeriodKey = "7d" | "30d" | "90d" | "6m" | "1a" | "custom";
export type Axis = "data" | "idade";

export const PERIOD_OPTIONS: Array<{ key: PeriodKey; label: string; days: number }> = [
  { key: "7d", label: "7 dias", days: 7 },
  { key: "30d", label: "30 dias", days: 30 },
  { key: "90d", label: "90 dias", days: 90 },
  { key: "6m", label: "6 meses", days: 182 },
  { key: "1a", label: "1 ano", days: 365 },
];

export interface ResolvedFilters {
  period: PeriodKey;
  from: string;
  to: string;
  days: number;
  label: string;
  axis: Axis;
  house: string | null;
}

export type SearchParams = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function resolveFilters(sp: SearchParams, refDate: string, defaultPeriod: PeriodKey = "30d"): ResolvedFilters {
  const p = (one(sp.periodo) as PeriodKey) || defaultPeriod;
  const axis: Axis = one(sp.eixo) === "idade" ? "idade" : "data";
  const house = one(sp.galpao)?.toUpperCase() ?? null;
  if (p === "custom") {
    const de = one(sp.de);
    const ate = one(sp.ate);
    if (de && ate && isISODate(de) && isISODate(ate) && de <= ate) {
      const days = Math.round((Date.parse(ate) - Date.parse(de)) / 86400000) + 1;
      return { period: "custom", from: de, to: ate > refDate ? refDate : ate, days, label: "personalizado", axis, house };
    }
  }
  const opt = PERIOD_OPTIONS.find((o) => o.key === p) ?? PERIOD_OPTIONS.find((o) => o.key === defaultPeriod)!;
  return { period: opt.key, from: addDays(refDate, -(opt.days - 1)), to: refDate, days: opt.days, label: `últimos ${opt.label}`, axis, house };
}

export function toQuery(sp: SearchParams, patch: Record<string, string | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const s = one(v);
    if (s != null) q.set(k, s);
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v == null) q.delete(k);
    else q.set(k, v);
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}
