import { describe, expect, it } from "vitest";
import { calibrateFinance } from "@/simulator/calibrate";
import { D_END } from "./world";

describe("calibração das 6 últimas semanas (Parte 7.10)", () => {
  const r = calibrateFinance(20261125, D_END);
  it("(a) P007 com margem semanal negativa nas 3 últimas semanas completas", () => expect(r.check.a).toBe(true));
  it("(b) P005 com margem por dúzia entre R$ 0,00 e R$ 0,30 na última semana completa", () => expect(r.check.b).toBe(true));
  it("(c) demais galpões com margem positiva nas 3 últimas semanas completas", () => expect(r.check.c).toBe(true));
  it("preços e ajuste do L107 dentro dos limites", () => {
    for (const v of r.calibEgg) {
      expect(v).toBeGreaterThanOrEqual(4.8);
      expect(v).toBeLessThanOrEqual(5.3);
    }
    expect(r.l107).toBeGreaterThanOrEqual(-4);
    expect(r.l107).toBeLessThanOrEqual(-1.5);
  });
});
