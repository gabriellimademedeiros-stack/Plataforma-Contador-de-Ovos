/**
 * Ranking de galpões (Parte 12.8): nota composta da última semana completa, só lotes com 26 semanas ou mais.
 * Componentes convertidos em 0–100 por mínimo e máximo entre os galpões (invertendo os de "menor é melhor").
 */
export interface RankInput {
  house: string;
  phase: string;
  ageWeek: number;
  postureDev: number | null;
  mortVsStd: number | null;
  defects: number | null;
  convVsExpected: number | null;
  marginPerBird: number | null;
}

export const RANK_COMPONENTS: Array<{ key: keyof RankInput; label: string; weight: number; higherBetter: boolean }> = [
  { key: "postureDev", label: "Desvio de postura × padrão", weight: 0.3, higherBetter: true },
  { key: "mortVsStd", label: "Mortalidade − padrão", weight: 0.2, higherBetter: false },
  { key: "defects", label: "Avarias + sujos", weight: 0.2, higherBetter: false },
  { key: "convVsExpected", label: "Conversão − esperada", weight: 0.1, higherBetter: false },
  { key: "marginPerBird", label: "Margem por ave alojada", weight: 0.2, higherBetter: true },
];

export interface RankResult extends RankInput {
  score: number;
  position: number;
  contributions: Record<string, number>;
}

export function rankHouses(items: RankInput[], opts: { includeMargin: boolean } = { includeMargin: true }): RankResult[] {
  const comps = RANK_COMPONENTS.filter((c) => opts.includeMargin || c.key !== "marginPerBird");
  const totalW = comps.reduce((a, c) => a + c.weight, 0);
  const res = items.map((it) => {
    const contributions: Record<string, number> = {};
    let score = 0;
    for (const c of comps) {
      const vals = items.map((x) => x[c.key] as number | null).filter((v): v is number => v != null);
      const v = it[c.key] as number | null;
      let norm = 50;
      if (v != null && vals.length > 1) {
        const mn = Math.min(...vals);
        const mx = Math.max(...vals);
        norm = mx === mn ? 50 : ((v - mn) / (mx - mn)) * 100;
        if (!c.higherBetter) norm = 100 - norm;
      }
      const part = (norm * c.weight) / totalW;
      contributions[c.label] = part;
      score += part;
    }
    return { ...it, score, position: 0, contributions };
  });
  res.sort((a, b) => b.score - a.score);
  res.forEach((r, i) => (r.position = i + 1));
  return res;
}
