/**
 * Números aleatórios determinísticos (Parte 7.1): mulberry32 + Box–Muller + Poisson (Knuth / aproximação normal).
 * Cada fluxo (ex.: "P003:postura") tem sua própria semente derivada de hash(SIM_SEED + ":" + nome).
 */

/** Hash de 32 bits (cyrb53 reduzido) de uma string. */
export function hash32(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

export function mulberry32(a: number): () => number {
  let s = a >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  private next: () => number;
  private spare: number | null = null;

  constructor(seed: number) {
    this.next = mulberry32(seed);
  }

  uniform(): number {
    return this.next();
  }

  /** Normal por Box–Muller. */
  normal(mean = 0, sd = 1): number {
    if (sd === 0) return mean;
    if (this.spare !== null) {
      const v = this.spare;
      this.spare = null;
      return mean + sd * v;
    }
    let u = 0;
    let v = 0;
    while (u <= Number.EPSILON) u = this.next();
    v = this.next();
    const r = Math.sqrt(-2 * Math.log(u));
    const z0 = r * Math.cos(2 * Math.PI * v);
    this.spare = r * Math.sin(2 * Math.PI * v);
    return mean + sd * z0;
  }

  /** Poisson: Knuth para λ < 30; acima, round(normal(λ, √λ)), nunca negativo. */
  poisson(lambda: number): number {
    if (!(lambda > 0)) return 0;
    if (lambda < 30) {
      const L = Math.exp(-lambda);
      let k = 0;
      let p = 1;
      do {
        k++;
        p *= this.next();
      } while (p > L);
      return k - 1;
    }
    return Math.max(0, Math.round(this.normal(lambda, Math.sqrt(lambda))));
  }
}

/** Fábrica de fluxos independentes a partir da semente global. */
export class RngFactory {
  private cache = new Map<string, Rng>();
  constructor(public readonly seed: number) {}

  stream(name: string): Rng {
    let r = this.cache.get(name);
    if (!r) {
      r = new Rng(hash32(`${this.seed}:${name}`));
      this.cache.set(name, r);
    }
    return r;
  }

  /** Fluxo novo (sem cache), útil para valores pontuais reprodutíveis. */
  fresh(name: string): Rng {
    return new Rng(hash32(`${this.seed}:${name}`));
  }
}
