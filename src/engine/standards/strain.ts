/** Padrões da linhagem a partir da tabela semanal (strain_standards), com interpolação na idade decimal. */

export interface StrainStandardRow {
  strainCode: string;
  ageWeek: number;
  metric: string;
  value: number;
}

const CUMULATIVE = new Set(["mort.acumulada", "prod.oaa"]);

export class StrainStandards {
  private table = new Map<string, Map<string, Map<number, number>>>();

  constructor(rows: StrainStandardRow[]) {
    for (const r of rows) {
      let s = this.table.get(r.strainCode);
      if (!s) this.table.set(r.strainCode, (s = new Map()));
      let m = s.get(r.metric);
      if (!m) s.set(r.metric, (m = new Map()));
      m.set(r.ageWeek, r.value);
    }
  }

  /** Valor da tabela numa semana inteira. */
  week(strain: string, metric: string, week: number): number | null {
    return this.table.get(strain)?.get(metric)?.get(week) ?? null;
  }

  /** Valor numa idade decimal (semanas). Antes de 17 semanas: nulo. */
  at(strain: string, metric: string, w: number): number | null {
    const m = this.table.get(strain)?.get(metric);
    if (!m || w < 17) return null;
    const wf = Math.floor(w);
    const frac = w - wf;
    if (CUMULATIVE.has(metric)) {
      const prev = wf <= 17 ? 0 : (m.get(wf - 1) ?? null);
      const cur = m.get(wf) ?? m.get(100) ?? null;
      if (prev == null || cur == null) return null;
      return prev + frac * (cur - prev);
    }
    const a = m.get(wf) ?? m.get(100);
    const b = m.get(wf + 1) ?? a;
    if (a == null || b == null) return null;
    return a + frac * (b - a);
  }

  has(strain: string, metric: string): boolean {
    return !!this.table.get(strain)?.get(metric);
  }
}
