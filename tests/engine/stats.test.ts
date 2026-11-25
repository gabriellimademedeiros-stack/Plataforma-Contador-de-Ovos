import { describe, expect, it } from "vitest";
import { cosineMasked, cusumStep, linreg, mad, mean, median, quantile, robustSd, robustZ, slope } from "@/engine/stats";

describe("estatística", () => {
  it("média e mediana ignoram nulos", () => {
    expect(mean([1, 2, null, 3])).toBe(2);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });
  it("quantis", () => {
    expect(quantile([1, 2, 3, 4, 5], 0.25)).toBe(2);
    expect(quantile([1, 2, 3, 4, 5], 0.75)).toBe(4);
  });
  it("MAD e desvio robusto com piso", () => {
    expect(mad([1, 2, 3, 4, 100])).toBe(1);
    expect(robustSd([1, 2, 3, 4, 100])).toBeCloseTo(1.4826, 4);
    expect(robustSd([5, 5, 5], 0.5)).toBe(0.5);
  });
  it("escore robusto", () => {
    expect(robustZ(6, [1, 2, 3, 4, 100])).toBeCloseTo(3 / 1.4826, 4);
  });
  it("regressão linear simples", () => {
    const f = linreg([0, 1, 2, 3], [1, 3, 5, 7])!;
    expect(f.a).toBeCloseTo(1, 9);
    expect(f.b).toBeCloseTo(2, 9);
    expect(f.r2).toBeCloseTo(1, 9);
    expect(slope([10, 9, 8])).toBeCloseTo(-1, 9);
  });
  it("CUSUM de quedas acumula resíduos negativos e zera ao normalizar", () => {
    let s = 0;
    for (const r of [-2, -2, -2]) s = cusumStep(s, r, 0.5);
    expect(s).toBeCloseTo(4.5, 9);
    s = cusumStep(s, 5, 0.5);
    expect(s).toBe(0);
  });
  it("cosseno com máscara e limite em [0; 1]", () => {
    expect(cosineMasked([1, 0, null], [1, 0, 5])).toBeCloseTo(1, 9);
    expect(cosineMasked([1, 1], [-1, -1])).toBe(0);
    expect(cosineMasked([null], [1])).toBeNull();
  });
});
