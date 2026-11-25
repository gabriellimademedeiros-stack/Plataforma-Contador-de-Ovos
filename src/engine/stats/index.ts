/** Estatística básica do motor (funções puras). Valores nulos/NaN são ignorados. */

export type MaybeNum = number | null | undefined;

export function clean(xs: MaybeNum[]): number[] {
  const out: number[] = [];
  for (const x of xs) if (x != null && Number.isFinite(x)) out.push(x);
  return out;
}

export function sum(xs: MaybeNum[]): number {
  let s = 0;
  for (const x of xs) if (x != null && Number.isFinite(x)) s += x;
  return s;
}

export function mean(xs: MaybeNum[]): number | null {
  const c = clean(xs);
  return c.length ? c.reduce((a, b) => a + b, 0) / c.length : null;
}

/** Quantil por interpolação linear (tipo 7, como no Excel/R padrão). */
export function quantile(xs: MaybeNum[], q: number): number | null {
  const c = clean(xs).sort((a, b) => a - b);
  if (!c.length) return null;
  const pos = (c.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return c[lo] + (c[hi] - c[lo]) * (pos - lo);
}

export function median(xs: MaybeNum[]): number | null {
  return quantile(xs, 0.5);
}

/** Desvio absoluto mediano. */
export function mad(xs: MaybeNum[]): number | null {
  const m = median(xs);
  if (m == null) return null;
  return median(clean(xs).map((x) => Math.abs(x - m)));
}

/** Desvio-padrão robusto = 1,4826 × MAD, com piso opcional. */
export function robustSd(xs: MaybeNum[], floor = 0): number | null {
  const m = mad(xs);
  if (m == null) return null;
  return Math.max(1.4826 * m, floor);
}

export function stdev(xs: MaybeNum[]): number | null {
  const c = clean(xs);
  if (c.length < 2) return null;
  const mu = c.reduce((a, b) => a + b, 0) / c.length;
  return Math.sqrt(c.reduce((a, b) => a + (b - mu) ** 2, 0) / (c.length - 1));
}

/** Escore robusto: (x − mediana) / dp robusto. */
export function robustZ(x: number, xs: MaybeNum[], floor = 0): number | null {
  const m = median(xs);
  const s = robustSd(xs, floor);
  if (m == null || s == null || s === 0) return null;
  return (x - m) / s;
}

/** Regressão linear simples y = a + b·x (mínimos quadrados). */
export function linreg(xs: MaybeNum[], ys: MaybeNum[]): { a: number; b: number; n: number; r2: number } | null {
  const px: number[] = [];
  const py: number[] = [];
  for (let i = 0; i < Math.min(xs.length, ys.length); i++) {
    const x = xs[i];
    const y = ys[i];
    if (x != null && y != null && Number.isFinite(x) && Number.isFinite(y)) {
      px.push(x);
      py.push(y);
    }
  }
  const n = px.length;
  if (n < 2) return null;
  const mx = px.reduce((a, b) => a + b, 0) / n;
  const my = py.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (px[i] - mx) ** 2;
    sxy += (px[i] - mx) * (py[i] - my);
    syy += (py[i] - my) ** 2;
  }
  if (sxx === 0) return null;
  const b = sxy / sxx;
  return { a: my - b * mx, b, n, r2: syy === 0 ? 0 : (sxy * sxy) / (sxx * syy) };
}

/** Inclinação por dia de uma série (índice = dia). */
export function slope(ys: MaybeNum[]): number | null {
  return linreg(
    ys.map((_, i) => i),
    ys,
  )?.b ?? null;
}

/**
 * Um passo do CUSUM unilateral para quedas: S(d) = max(0, S(d−1) − r(d) − k).
 * r é o resíduo padronizado (negativo quando abaixo do esperado).
 */
export function cusumStep(prev: number, r: number, k = 0.5): number {
  return Math.max(0, prev - r - k);
}

/** Similaridade do cosseno nas posições presentes nos dois vetores, limitada a [0; 1]. */
export function cosineMasked(a: MaybeNum[], b: MaybeNum[]): number | null {
  let dot = 0;
  let na = 0;
  let nb = 0;
  let n = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const x = a[i];
    const y = b[i];
    if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    dot += x * y;
    na += x * x;
    nb += y * y;
    n++;
  }
  if (n === 0 || na === 0 || nb === 0) return null;
  return Math.min(1, Math.max(0, dot / Math.sqrt(na * nb)));
}

export function clampNum(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function round(v: number, d = 2): number {
  const k = 10 ** d;
  return Math.round(v * k) / k;
}
