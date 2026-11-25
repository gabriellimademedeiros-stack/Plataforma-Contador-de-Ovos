/**
 * Laboratório (Parte 14.9): vida útil estimada do ovo (dias até a Unidade Haugh cair ao limite) e
 * limites de controle da resistência da casca (gráfico de valores individuais, I-MR).
 */
export interface HaughPoint {
  day: number;
  haugh: number;
}

export interface ShelfLifeEstimate {
  days: number | null;
  method: "interpolado" | "extrapolado" | "acima do limite" | "abaixo no início" | null;
}

/**
 * Dias até a Haugh chegar ao limite: interpolação linear entre as duas medições que cruzam o limite.
 * Se ainda não cruzou, extrapola pela inclinação das duas últimas medições (marcado como "extrapolado").
 */
export function shelfLifeDays(points: HaughPoint[], limit = 60): ShelfLifeEstimate {
  const p = [...points].filter((x) => Number.isFinite(x.haugh)).sort((a, b) => a.day - b.day);
  if (!p.length) return { days: null, method: null };
  if (p[0].haugh <= limit) return { days: p[0].day, method: "abaixo no início" };
  for (let i = 1; i < p.length; i++) {
    if (p[i].haugh <= limit) {
      const a = p[i - 1];
      const b = p[i];
      const t = (a.haugh - limit) / (a.haugh - b.haugh);
      return { days: Math.round((a.day + t * (b.day - a.day)) * 10) / 10, method: "interpolado" };
    }
  }
  if (p.length >= 2) {
    const a = p[p.length - 2];
    const b = p[p.length - 1];
    const slope = (b.haugh - a.haugh) / (b.day - a.day);
    if (slope < 0) return { days: Math.round((b.day + (limit - b.haugh) / slope) * 10) / 10, method: "extrapolado" };
  }
  return { days: null, method: "acima do limite" };
}

/** Curva média por dia de armazenamento (média simples da Haugh, que não é percentual). */
export function averageCurve(tests: HaughPoint[][]): HaughPoint[] {
  const by = new Map<number, number[]>();
  for (const t of tests) for (const p of t) by.set(p.day, [...(by.get(p.day) ?? []), p.haugh]);
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([day, v]) => ({ day, haugh: v.reduce((s, x) => s + x, 0) / v.length }));
}

export interface ControlLimits {
  center: number;
  lcl: number;
  ucl: number;
  sigma: number;
  n: number;
}

/** Limites de controle de valores individuais: média ± 3 × (amplitude móvel média ÷ 1,128). */
export function controlLimits(values: number[]): ControlLimits | null {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length < 5) return null;
  const center = v.reduce((a, b) => a + b, 0) / v.length;
  let mr = 0;
  for (let i = 1; i < v.length; i++) mr += Math.abs(v[i] - v[i - 1]);
  const sigma = mr / (v.length - 1) / 1.128;
  return { center, lcl: center - 3 * sigma, ucl: center + 3 * sigma, sigma, n: v.length };
}
