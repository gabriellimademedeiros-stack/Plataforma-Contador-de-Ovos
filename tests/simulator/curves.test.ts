import { describe, expect, it } from "vitest";
import { STRAINS } from "@/simulator/config";
import {
  curveBodyWeight,
  curveEggWeight,
  curveFeed,
  curvePostura,
  strainParams,
  strainStandardAt,
  strainStandardTable,
  weeklyMortalityStd,
} from "@/simulator/curves";
import { uuidFromName } from "@/lib/ids";

describe("curvas das linhagens", () => {
  it("postura sobe até o pico e cai depois da semana 28", () => {
    const a = strainParams("ALFA");
    expect(curvePostura(a, 17)).toBeLessThan(30);
    expect(curvePostura(a, 28)).toBeGreaterThan(94);
    expect(curvePostura(a, 28)).toBeLessThan(95.5);
    // 0,42 p.p. por semana depois do pico
    expect(curvePostura(a, 38) - curvePostura(a, 48)).toBeCloseTo(4.2, 1);
  });
  it("peso do ovo, peso corporal e ração crescem assintoticamente", () => {
    const b = strainParams("BETA");
    expect(curveEggWeight(b, 18)).toBeCloseTo(45, 5);
    expect(curveEggWeight(b, 90)).toBeGreaterThan(64);
    expect(curveBodyWeight(b, 18)).toBeCloseTo(1450, 5);
    expect(curveFeed(b, 18)).toBeCloseTo(96, 5);
    expect(curveFeed(b, 60)).toBeCloseTo(112, 0);
  });
  it("mortalidade semanal padrão por fase", () => {
    expect(weeklyMortalityStd(20)).toBe(0.09);
    expect(weeklyMortalityStd(50)).toBe(0.07);
    expect(weeklyMortalityStd(80)).toBe(0.1);
  });
  it("tabela de padrões cobre semanas 17 a 100 com 8 métricas por linhagem", () => {
    for (const s of STRAINS) {
      const t = strainStandardTable(s);
      expect(t.length).toBe(84 * 8);
      const mort = t.filter((r) => r.metric === "mort.acumulada");
      expect(mort[0].value).toBeCloseTo(0.09, 6);
      expect(mort.at(-1)!.value).toBeGreaterThan(mort[0].value);
    }
  });
  it("padrão numa idade decimal", () => {
    const a = strainParams("ALFA");
    expect(strainStandardAt(a, "prod.postura", 16)).toBeNull();
    expect(strainStandardAt(a, "mort.acumulada", 18)).toBeCloseTo(0.09, 6);
    expect(strainStandardAt(a, "prod.oaa", 17)).toBe(0);
  });
  it("ids determinísticos", () => {
    expect(uuidFromName("house:P001")).toBe(uuidFromName("house:P001"));
    expect(uuidFromName("house:P001")).not.toBe(uuidFromName("house:P002"));
    expect(uuidFromName("x")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
