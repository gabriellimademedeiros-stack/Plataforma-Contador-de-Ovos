/**
 * Calibração obrigatória das 6 últimas semanas (Parte 7.10): ajusta o preço do ovo dessas semanas (R$ 4,80–5,30)
 * e o ajuste de qualidade do L107 (−1,5 a −4,0 p.p.) até que:
 *  (a) P007 tenha margem semanal negativa nas 3 últimas semanas completas;
 *  (b) P005 tenha margem por dúzia entre R$ 0,00 e R$ 0,30 na última semana completa;
 *  (c) todos os outros galpões tenham margem positiva nas 3 últimas semanas completas.
 * Busca determinística (mesma semente e D_end → mesmo resultado).
 */
import { addDays, lastCompleteWeekStart, weekStart } from "@/lib/dates";
import { emptyCounts, type ClassCounts, type Dataset } from "@/engine/types";
import { financeDay } from "@/engine/finance/daily";
import { PRICES } from "./config";
import { generateDataset } from "./generate";

export interface CalibrationResult {
  calibEgg: number[];
  l107: number;
  ok: boolean;
  check: CalibrationCheck;
}

export interface CalibrationCheck {
  weeks: string[];
  margins: Record<string, number[]>;
  marginDz: Record<string, number[]>;
  a: boolean;
  b: boolean;
  c: boolean;
}

const dailyCache = new WeakMap<Dataset, Map<string, Dataset["daily"][number]>>();

/** Margens semanais das 3 últimas semanas completas, com preços do ovo substituídos (sem recalcular o resto). */
export function weeklyMargins(ds: Dataset, eggPriceByWeek: Map<string, number>): CalibrationCheck {
  const last = lastCompleteWeekStart(ds.dEnd);
  const weeks = [addDays(last, -14), addDays(last, -7), last];
  const prices = new Map(ds.prices.map((p) => [p.weekStart, p]));
  const flocks = new Map(ds.flocks.map((f) => [f.code, f]));
  const egg = new Map(ds.eggDaily.map((e) => [`${e.house}|${e.date}`, e]));
  let daily = dailyCache.get(ds);
  if (!daily) dailyCache.set(ds, (daily = new Map(ds.daily.map((r) => [`${r.house}|${r.date}`, r]))));
  const margins: Record<string, number[]> = {};
  const marginDz: Record<string, number[]> = {};
  for (const h of ds.houses) {
    margins[h.code] = [];
    marginDz[h.code] = [];
    for (const ws of weeks) {
      let m = 0;
      let dz = 0;
      for (let k = 0; k < 7; k++) {
        const d = addDays(ws, k);
        const r = daily.get(`${h.code}|${d}`);
        const e = egg.get(`${h.code}|${d}`);
        if (!r || !e || r.feedKg == null) continue;
        const f = flocks.get(r.flock)!;
        const p = prices.get(weekStart(d))!;
        const eggP = eggPriceByWeek.get(weekStart(d)) ?? p.ovo_comercial_dz;
        const c: ClassCounts = emptyCounts();
        for (const key of Object.keys(c) as (keyof ClassCounts)[]) c[key] = e.lanes[1][key] + e.lanes[2][key];
        const fin = financeDay({
          counts: c,
          feedKg: r.feedKg,
          birds: r.birdsStart,
          birdsHoused: f.birdsHoused,
          plannedDays: f.plannedCullAgeWeeks * 7 - 119,
          prices: { ...p, ovo_comercial_dz: eggP, ovo_trincado_dz: eggP * PRICES.crackedShare, ovo_sujo_dz: eggP * PRICES.dirtyShare },
          cost: ds.costParams,
        });
        m += fin.margem;
        dz += fin.eggs / 12;
      }
      margins[h.code].push(m);
      marginDz[h.code].push(dz > 0 ? m / dz : 0);
    }
  }
  const a = margins.P007?.every((v) => v < 0) ?? false;
  const p5 = marginDz.P005?.[2] ?? -1;
  const b = p5 >= 0 && p5 <= 0.3;
  const c = Object.entries(margins).filter(([h]) => h !== "P007").every(([, v]) => v.every((x) => x > 0));
  return { weeks, margins, marginDz, a, b, c };
}

export function calibrateFinance(seed: number, dEnd: string): CalibrationResult {
  const lastWeek = weekStart(dEnd);
  const calibWeeks = Array.from({ length: 6 }, (_, i) => addDays(lastWeek, -35 + 7 * i));
  const offsets = [-2.0, -2.5, -3.0, -1.5, -3.5, -4.0];
  let best: CalibrationResult | null = null;
  for (const l107 of offsets) {
    const ds = generateDataset({ seed, dEnd, skipHourly: true, qualityOffset: { L107: l107 } });
    for (let step = 0; step <= 60; step++) {
      // desloca os preços de partida em ±0,01 alternando (0, +0,01, −0,01, +0,02, …)
      const delta = (step % 2 === 0 ? -1 : 1) * Math.ceil(step / 2) * 0.01;
      const calibEgg = PRICES.calibEgg.map((v) => Math.min(PRICES.calibEggMax, Math.max(PRICES.calibEggMin, Math.round((v + delta) * 100) / 100)));
      const map = new Map(calibWeeks.map((w, i) => [w, calibEgg[i]]));
      const check = weeklyMargins(ds, map);
      const r: CalibrationResult = { calibEgg, l107, ok: check.a && check.b && check.c, check };
      if (r.ok) return r;
      if (!best || Number(check.a) + Number(check.b) + Number(check.c) > Number(best.check.a) + Number(best.check.b) + Number(best.check.c)) best = r;
    }
  }
  return best!;
}
