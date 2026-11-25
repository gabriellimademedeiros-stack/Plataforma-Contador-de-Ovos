import { describe, expect, it } from "vitest";
import { simulatePrices } from "@/engine/finance/price-sim";
import { marginBridge } from "@/engine/finance/bridge";
import { projectCulling } from "@/engine/finance/culling";
import { forecastHouse, farmForecast } from "@/engine/forecast/forecast";
import { rankHouses } from "@/engine/ranking/houses";
import { StrainStandards } from "@/engine/standards/strain";
import { defaultStrainStandardRows } from "@/engine/metrics/pipeline";
import { COST_PARAMS } from "@/simulator/config";

const std = new StrainStandards(defaultStrainStandardRows());
const cost = Object.fromEntries(COST_PARAMS.map((c) => [c.key, c.value]));

describe("simulador de preços (Parte 12.4)", () => {
  const h = { house: "P001", dzClean: 1000, dzCracked: 20, dzDirty: 15, eggs: 12420, birdDays: 14000, feedKg: 1500, otherCosts: 1200, currentEgg: 5, currentFeed: 2 };
  it("recalcula receita, custo, margem e equilíbrio", () => {
    const r = simulatePrices(h, 5, 2);
    expect(r.receita).toBeCloseTo(1000 * 5 + 20 * 5 * 0.55 + 15 * 5 * 0.75, 9);
    expect(r.custo).toBeCloseTo(1200 + 3000, 9);
    expect(r.margem).toBeCloseTo(r.receita - r.custo, 9);
    expect(r.margemDz).toBeCloseTo(r.margem / (12420 / 12), 9);
    expect(r.breakEven).toBeCloseTo(((r.custo * 12420) / (r.receita * 14000)) * 100, 9);
  });
  it("preço do ovo 10% menor reduz a margem", () => {
    expect(simulatePrices(h, 4.5, 2).margem).toBeLessThan(simulatePrices(h, 5, 2).margem);
  });
});

describe("ponte de margem (Parte 12.5)", () => {
  it("os efeitos somam a variação da margem", () => {
    const ref = { weekStart: "2026-10-04", margin: 1000, dozens: 30000, eggPrice: 5.1, feedKg: 60000, feedPrice: 1.96 };
    const cur = { weekStart: "2026-11-15", margin: -3000, dozens: 29000, eggPrice: 5.0, feedKg: 60500, feedPrice: 1.98 };
    const b = marginBridge(ref, cur);
    const sum = Object.values(b.effects).reduce((a, v) => a + v, 0);
    expect(sum).toBeCloseTo(cur.margin - ref.margin, 6);
    expect(b.effects["Preço do ovo"]).toBeCloseTo(-0.1 * 29000, 6);
    expect(b.steps[0].value).toBe(1000);
    expect(b.steps.at(-1)!.value).toBe(-3000);
  });
});

describe("decisão de descarte (Parte 12.6)", () => {
  const base = { flock: "L107", strainCode: "GAMA", hatchDate: "2025-05-24", from: "2026-11-25", birds: 80000, adjustment: -4, shares: { commercial: 0.94, cracked: 0.03, dirty: 0.02, broken: 0.01 }, cost, weeks: 16 };
  it("projeta 16 semanas e recomenda a primeira semana negativa por 2 semanas seguidas", () => {
    const r = projectCulling({ ...base, prices: { egg: 4.0, cracked: 2.2, dirty: 3.0, feed: 2.2 } }, std, "2027-02-13");
    expect(r.weeks).toHaveLength(16);
    expect(r.basis).toBe("margem");
    const k = r.recommendedWeek! - 1;
    expect(r.weeks[k].contribution).toBeLessThan(0);
    expect(r.weeks[k + 1].contribution).toBeLessThan(0);
  });
  it("sem semanas negativas, recomenda o descarte planejado", () => {
    const r = projectCulling({ ...base, prices: { egg: 6, cracked: 3.3, dirty: 4.5, feed: 1.8 } }, std, "2027-02-13");
    expect(r.basis).toBe("planejado");
    expect(r.recommendedDate).toBe("2027-02-13");
  });
});

describe("previsão de produção (Parte 12.7)", () => {
  it("faixa de incerteza cresce com a semana e lote descartado zera", () => {
    const f = forecastHouse({ house: "P007", flock: "L107", strainCode: "GAMA", hatchDate: "2025-05-24", plannedCullAgeWeeks: 90, birds: 80000, adjustment: -4 }, std, "2027-02-01", 8);
    expect(f[0].postureHigh - f[0].posture).toBeCloseTo(1.3, 6);
    expect(f[7].postureHigh - f[7].posture).toBeCloseTo(3.4, 6);
    expect(f.at(-1)!.eggs).toBe(0);
    expect(farmForecast(f)).toHaveLength(8);
  });
});

describe("ranking de galpões (Parte 12.8)", () => {
  it("normaliza por mínimo e máximo e inverte os de menor é melhor", () => {
    const r = rankHouses([
      { house: "A", phase: "Pico", ageWeek: 40, postureDev: 2, mortVsStd: 0, defects: 2, convVsExpected: 0, marginPerBird: 1 },
      { house: "B", phase: "Pico", ageWeek: 40, postureDev: -2, mortVsStd: 0.1, defects: 4, convVsExpected: 0.1, marginPerBird: -1 },
    ]);
    expect(r[0].house).toBe("A");
    expect(r[0].score).toBeCloseTo(100, 6);
    expect(r[1].score).toBeCloseTo(0, 6);
  });
});
