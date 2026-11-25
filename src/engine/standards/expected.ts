/**
 * Valor esperado de postura (Parte 8.4), usado por alertas, decomposição e previsão.
 *   ajuste_do_lote(d) = mediana de (postura − P_linhagem(w)) nos dias d−35 a d−8 (dias válidos, fora de janelas de efeito)
 *   β_calor(galpão)   = regressão do resíduo contra Hlag em todo o histórico, limitada a [0; 2]; sem dado = 1,0
 *   Esperado com calor = P_linhagem(w) + ajuste − β_calor · Hlag(d)
 */
import { addDays, ageWeeksDecimal } from "@/lib/dates";
import { clampNum, linreg, median } from "@/engine/stats";
import type { MetricStore } from "@/engine/metrics/store";
import type { StrainStandards } from "./strain";
import type { Flock } from "@/engine/types";

export const HEAT_THRESHOLD = 31;

/** H1(d) = max(0, Tint_max(d) − 31) */
export function h1(store: MetricStore, house: string, date: string): number | null {
  const t = store.get(house, "amb.temp_max", date);
  return t == null ? null : Math.max(0, t - HEAT_THRESHOLD);
}

/** Hlag(d) = média de H1 em d−1 e d−2 */
export function hlag(store: MetricStore, house: string, date: string): number | null {
  const a = h1(store, house, addDays(date, -1));
  const b = h1(store, house, addDays(date, -2));
  const xs = [a, b].filter((x): x is number => x != null);
  return xs.length ? xs.reduce((p, c) => p + c, 0) / xs.length : null;
}

export interface ExpectedContext {
  store: MetricStore;
  strainStd: StrainStandards;
  flocks: Map<string, Flock>;
  /** Dias a excluir do ajuste (janelas de efeito de eventos e alertas) por galpão. */
  excluded?: (house: string, date: string) => boolean;
  betaCache?: Map<string, number>;
}

export function strainPostureAt(ctx: ExpectedContext, house: string, date: string): number | null {
  const code = ctx.store.flockAt(house, date);
  const f = code ? ctx.flocks.get(code) : undefined;
  if (!f) return null;
  return ctx.strainStd.at(f.strainCode, "prod.postura", ageWeeksDecimal(date, f.hatchDate));
}

/** Ajuste do lote no dia d (mediana de postura − linhagem em d−35…d−8). */
export function flockAdjustment(ctx: ExpectedContext, house: string, date: string): number | null {
  const code = ctx.store.flockAt(house, date);
  const vals: number[] = [];
  for (let k = 35; k >= 8; k--) {
    const d = addDays(date, -k);
    if (ctx.store.flockAt(house, d) !== code) continue;
    if (ctx.excluded?.(house, d)) continue;
    const p = ctx.store.getValid(house, "prod.postura", d);
    const s = strainPostureAt(ctx, house, d);
    if (p != null && s != null) vals.push(p - s);
  }
  return vals.length >= 5 ? median(vals) : null;
}

/** β de calor do galpão (regressão do resíduo contra Hlag em todo o histórico disponível). */
export function heatBeta(ctx: ExpectedContext, house: string, upTo?: string): number {
  const key = `${house}|${upTo ?? "all"}`;
  const cached = ctx.betaCache?.get(key);
  if (cached != null) return cached;
  const xs: number[] = [];
  const ys: number[] = [];
  const end = upTo ?? ctx.store.end;
  // amostra a cada 2 dias para custo baixo; resíduo com ajuste móvel
  for (let d = addDays(ctx.store.start, 40); d <= end; d = addDays(d, 2)) {
    if (ctx.excluded?.(house, d)) continue;
    const p = ctx.store.getValid(house, "prod.postura", d);
    const s = strainPostureAt(ctx, house, d);
    const hl = hlag(ctx.store, house, d);
    if (p == null || s == null || hl == null) continue;
    const adj = flockAdjustment(ctx, house, d);
    if (adj == null) continue;
    xs.push(hl);
    ys.push(-(p - s - adj));
  }
  const fit = xs.filter((x) => x > 0).length >= 10 ? linreg(xs, ys) : null;
  const beta = fit ? clampNum(fit.b, 0, 2) : 1.0;
  ctx.betaCache?.set(key, beta);
  return beta;
}

export interface ExpectedPosture {
  strain: number;
  adjustment: number;
  beta: number;
  hlag: number;
  withoutHeat: number;
  withHeat: number;
}

export function expectedPosture(ctx: ExpectedContext, house: string, date: string, opts: { betaUpTo?: string } = {}): ExpectedPosture | null {
  const s = strainPostureAt(ctx, house, date);
  if (s == null) return null;
  const adj = flockAdjustment(ctx, house, date) ?? 0;
  const beta = heatBeta(ctx, house, opts.betaUpTo);
  const hl = hlag(ctx.store, house, date) ?? 0;
  const withoutHeat = s + adj;
  return { strain: s, adjustment: adj, beta, hlag: hl, withoutHeat, withHeat: withoutHeat - beta * hl };
}
