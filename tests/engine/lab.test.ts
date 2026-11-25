import { describe, expect, it } from "vitest";
import { averageCurve, controlLimits, shelfLifeDays } from "@/engine/lab";

describe("laboratório", () => {
  it("vida útil por interpolação até Haugh 60", () => {
    // 72 no dia 14 e 58 no dia 21 → cruza 60 em 14 + (12/14)×7 = 20
    expect(shelfLifeDays([{ day: 0, haugh: 84 }, { day: 7, haugh: 78 }, { day: 14, haugh: 72 }, { day: 21, haugh: 58 }])).toEqual({ days: 20, method: "interpolado" });
  });
  it("extrapola quando ainda não cruzou e respeita limite configurável", () => {
    expect(shelfLifeDays([{ day: 0, haugh: 84 }, { day: 7, haugh: 77 }, { day: 14, haugh: 70 }])).toEqual({ days: 24, method: "extrapolado" });
    expect(shelfLifeDays([{ day: 0, haugh: 84 }, { day: 7, haugh: 77 }, { day: 14, haugh: 70 }], 72).method).toBe("interpolado");
  });
  it("curva média por dia", () => {
    expect(averageCurve([[{ day: 0, haugh: 80 }], [{ day: 0, haugh: 84 }, { day: 7, haugh: 70 }]])).toEqual([{ day: 0, haugh: 82 }, { day: 7, haugh: 70 }]);
  });
  it("limites de controle I-MR", () => {
    const c = controlLimits([3.5, 3.6, 3.4, 3.5, 3.6, 3.5])!;
    expect(c.center).toBeCloseTo(3.5167, 3);
    // amplitude móvel média = (0,1+0,2+0,1+0,1+0,1)/5 = 0,12 → σ = 0,1064
    expect(c.sigma).toBeCloseTo(0.12 / 1.128, 4);
    expect(c.ucl).toBeCloseTo(c.center + 3 * c.sigma, 6);
  });
});
