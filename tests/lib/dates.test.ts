import { describe, expect, it } from "vitest";
import {
  addDays,
  ageDays,
  ageWeek,
  ageWeeksDecimal,
  dayOfWeek,
  diffDays,
  farmInstant,
  farmYesterday,
  lastCompleteWeekStart,
  phaseForAgeWeek,
  productiveDate,
  weekLabel,
  weekStart,
} from "@/lib/dates";

describe("datas", () => {
  it("soma e diferença de dias atravessando meses e anos", () => {
    expect(addDays("2026-02-27", 2)).toBe("2026-03-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(diffDays("2026-01-01", "2026-12-31")).toBe(364);
    expect(diffDays("2026-11-24", "2026-11-20")).toBe(-4);
  });

  it("dia da semana (0 = domingo)", () => {
    expect(dayOfWeek("2026-11-22")).toBe(0);
    expect(dayOfWeek("2026-11-24")).toBe(2);
  });

  it("dia produtivo com corte às 06:00 no fuso de Fortaleza", () => {
    // 05:59 em Fortaleza = 08:59 UTC → ainda é o dia anterior
    expect(productiveDate(new Date("2026-11-25T08:59:00Z"))).toBe("2026-11-24");
    // 06:00 em Fortaleza = 09:00 UTC → novo dia produtivo
    expect(productiveDate(new Date("2026-11-25T09:00:00Z"))).toBe("2026-11-25");
    // 23:30 local = 02:30 UTC do dia seguinte
    expect(productiveDate(new Date("2026-11-26T02:30:00Z"))).toBe("2026-11-25");
    // 01:00 local do dia 26 → produtivo 25
    expect(productiveDate(new Date("2026-11-26T04:00:00Z"))).toBe("2026-11-25");
  });

  it("instante local da granja", () => {
    expect(farmInstant("2026-11-25", 6, 0).toISOString()).toBe("2026-11-25T09:00:00.000Z");
  });

  it("ontem no fuso da granja", () => {
    // 01:00 UTC do dia 25 = 22:00 local do dia 24 → ontem = 23
    expect(farmYesterday(new Date("2026-11-25T01:00:00Z"))).toBe("2026-11-23");
    expect(farmYesterday(new Date("2026-11-25T15:00:00Z"))).toBe("2026-11-24");
  });

  it("semana da granja de domingo a sábado", () => {
    expect(weekStart("2026-11-22")).toBe("2026-11-22");
    expect(weekStart("2026-11-28")).toBe("2026-11-22");
    expect(weekStart("2026-11-24")).toBe("2026-11-22");
    expect(weekLabel("2026-11-16")).toBe("Semana de 16/11 a 22/11/2026");
  });

  it("última semana completa", () => {
    expect(lastCompleteWeekStart("2026-11-24")).toBe("2026-11-15");
    expect(lastCompleteWeekStart("2026-11-28")).toBe("2026-11-22");
  });

  it("idade do lote", () => {
    expect(ageDays("2026-11-24", "2025-11-23")).toBe(366);
    expect(ageWeek("2026-11-24", "2025-11-23")).toBe(52);
    expect(ageWeeksDecimal("2026-11-24", "2025-11-23")).toBeCloseTo(52.2857, 3);
  });

  it("fases do lote", () => {
    expect(phaseForAgeWeek(16)).toBe("recria");
    expect(phaseForAgeWeek(17)).toBe("inicio");
    expect(phaseForAgeWeek(25)).toBe("inicio");
    expect(phaseForAgeWeek(26)).toBe("pico");
    expect(phaseForAgeWeek(57)).toBe("pico");
    expect(phaseForAgeWeek(58)).toBe("postura1");
    expect(phaseForAgeWeek(73)).toBe("postura1");
    expect(phaseForAgeWeek(74)).toBe("postura2");
  });
});
