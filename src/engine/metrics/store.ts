/**
 * Armazenamento em memória dos indicadores diários: por galpão e métrica, vetores indexados pelo dia.
 * NaN representa "sem valor". Usado pelo motor (alertas, causas, retratos) e convertido em linhas de daily_metrics.
 */
import { addDays, diffDays, type Phase } from "@/lib/dates";

export interface DayMeta {
  flock: (string | null)[];
  ageDays: Int16Array;
  ageWeek: Int16Array;
  phase: (Phase | null)[];
}

interface Cols {
  v: Float64Array;
  n: Float64Array;
  d: Float64Array;
  q: Uint8Array;
}

export class MetricStore {
  readonly days: number;
  private data = new Map<string, Map<string, Cols>>();
  readonly meta = new Map<string, DayMeta>();

  constructor(
    readonly start: string,
    readonly end: string,
    readonly houses: string[],
  ) {
    this.days = diffDays(start, end) + 1;
    for (const h of houses) {
      this.data.set(h, new Map());
      this.meta.set(h, {
        flock: new Array(this.days).fill(null),
        ageDays: new Int16Array(this.days),
        ageWeek: new Int16Array(this.days),
        phase: new Array(this.days).fill(null),
      });
    }
  }

  idx(date: string): number {
    return diffDays(this.start, date);
  }

  dateAt(i: number): string {
    return addDays(this.start, i);
  }

  inRange(date: string): boolean {
    const i = this.idx(date);
    return i >= 0 && i < this.days;
  }

  private cols(house: string, metric: string, create = false): Cols | undefined {
    const hm = this.data.get(house);
    if (!hm) return undefined;
    let c = hm.get(metric);
    if (!c && create) {
      c = {
        v: new Float64Array(this.days).fill(NaN),
        n: new Float64Array(this.days).fill(NaN),
        d: new Float64Array(this.days).fill(NaN),
        q: new Uint8Array(this.days).fill(2),
      };
      hm.set(metric, c);
    }
    return c;
  }

  set(house: string, metric: string, date: string, value: number | null, num?: number | null, den?: number | null, qf = 0) {
    const i = this.idx(date);
    if (i < 0 || i >= this.days) return;
    const c = this.cols(house, metric, true)!;
    const ok = value != null && Number.isFinite(value);
    c.v[i] = ok ? value! : NaN;
    c.n[i] = num != null && Number.isFinite(num) ? num : NaN;
    c.d[i] = den != null && Number.isFinite(den) ? den : NaN;
    c.q[i] = ok ? qf : 2;
  }

  setByIndex(house: string, metric: string, i: number, value: number | null, num?: number | null, den?: number | null, qf = 0) {
    if (i < 0 || i >= this.days) return;
    const c = this.cols(house, metric, true)!;
    const ok = value != null && Number.isFinite(value);
    c.v[i] = ok ? value! : NaN;
    c.n[i] = num != null && Number.isFinite(num) ? num : NaN;
    c.d[i] = den != null && Number.isFinite(den) ? den : NaN;
    c.q[i] = ok ? qf : 2;
  }

  get(house: string, metric: string, date: string): number | null {
    const c = this.cols(house, metric);
    if (!c) return null;
    const i = this.idx(date);
    if (i < 0 || i >= this.days) return null;
    const v = c.v[i];
    return Number.isNaN(v) ? null : v;
  }

  /** Valor só se o quality_flag for 0 (dados válidos para regras). */
  getValid(house: string, metric: string, date: string): number | null {
    const c = this.cols(house, metric);
    if (!c) return null;
    const i = this.idx(date);
    if (i < 0 || i >= this.days || c.q[i] !== 0) return null;
    const v = c.v[i];
    return Number.isNaN(v) ? null : v;
  }

  getNumDen(house: string, metric: string, date: string): { num: number | null; den: number | null } {
    const c = this.cols(house, metric);
    const i = this.idx(date);
    if (!c || i < 0 || i >= this.days) return { num: null, den: null };
    return { num: Number.isNaN(c.n[i]) ? null : c.n[i], den: Number.isNaN(c.d[i]) ? null : c.d[i] };
  }

  quality(house: string, metric: string, date: string): number {
    const c = this.cols(house, metric);
    const i = this.idx(date);
    if (!c || i < 0 || i >= this.days) return 2;
    return c.q[i];
  }

  setQuality(house: string, metric: string, date: string, qf: number) {
    const c = this.cols(house, metric);
    const i = this.idx(date);
    if (c && i >= 0 && i < this.days) c.q[i] = qf;
  }

  /** Série de valores (nulos onde não houver) de `from` a `to` inclusive. */
  series(house: string, metric: string, from: string, to: string, validOnly = false): (number | null)[] {
    const out: (number | null)[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) out.push(validOnly ? this.getValid(house, metric, d) : this.get(house, metric, d));
    return out;
  }

  metricsOf(house: string): string[] {
    return [...(this.data.get(house)?.keys() ?? [])];
  }

  flockAt(house: string, date: string): string | null {
    const i = this.idx(date);
    if (i < 0 || i >= this.days) return null;
    return this.meta.get(house)?.flock[i] ?? null;
  }

  ageWeekAt(house: string, date: string): number | null {
    const i = this.idx(date);
    const m = this.meta.get(house);
    if (!m || i < 0 || i >= this.days || m.flock[i] == null) return null;
    return m.ageWeek[i];
  }

  ageDaysAt(house: string, date: string): number | null {
    const i = this.idx(date);
    const m = this.meta.get(house);
    if (!m || i < 0 || i >= this.days || m.flock[i] == null) return null;
    return m.ageDays[i];
  }

  phaseAt(house: string, date: string): Phase | null {
    const i = this.idx(date);
    return this.meta.get(house)?.phase[i] ?? null;
  }

  /** Itera todas as células com lote alojado. */
  *cells(): Generator<{ house: string; metric: string; i: number; value: number | null; num: number | null; den: number | null; qf: number }> {
    for (const [house, hm] of this.data) {
      const meta = this.meta.get(house)!;
      for (const [metric, c] of hm) {
        for (let i = 0; i < this.days; i++) {
          if (meta.flock[i] == null) continue;
          yield {
            house,
            metric,
            i,
            value: Number.isNaN(c.v[i]) ? null : c.v[i],
            num: Number.isNaN(c.n[i]) ? null : c.n[i],
            den: Number.isNaN(c.d[i]) ? null : c.d[i],
            qf: c.q[i],
          };
        }
      }
    }
  }
}
