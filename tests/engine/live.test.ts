import { describe, expect, it } from "vitest";
import { evalA02, evalA08h, evalA11Hourly, liveToday } from "@/engine/alerts/live";

const day = (vals: number[]) => vals.map((v, slot) => ({ slot, value: v }));

describe("regras de tempo real", () => {
  it("A08h: água acumulada ≤ 85% da média das mesmas horas", () => {
    const prev = Array.from({ length: 7 }, () => day([1000, 1100, 1200, 1300, 1300]));
    expect(evalA08h(day([1000, 660, 720]), prev, { ratio: 0.85, base_days: 7, min_hours: 3 }).hit).toBe(true);
    expect(evalA08h(day([1000, 1100, 1150]), prev, { ratio: 0.85, base_days: 7, min_hours: 3 }).hit).toBe(false);
    expect(evalA08h(day([1000, 600]), prev, { ratio: 0.85, base_days: 7, min_hours: 3 }).hit).toBeNull();
  });
  it("A11 horário: 2 h acima de 32 °C ou uma acima de 35 °C (crítica)", () => {
    const p = { hours_threshold: 32, min_hours: 2, critical_temp: 35 };
    expect(evalA11Hourly(day([30, 33, 34]), p).hit).toBe(true);
    expect(evalA11Hourly(day([30, 33, 31]), p).hit).toBe(false);
    const c = evalA11Hourly(day([30, 35.4]), p);
    expect(c.hit && c.critical).toBe(true);
  });
  it("A02: mensagens por minuto chegando e nenhum ovo há 20 minutos", () => {
    const now = new Date("2026-11-25T14:00:00Z");
    const minutes = Array.from({ length: 85 }, (_, k) => ({ ts: new Date(now.getTime() - (85 - k) * 60_000).toISOString(), eggs: k < 60 ? 380 : 0 }));
    const p = { lookback_min: 120, no_eggs_min: 20, start_hour: 6, end_hour: 16 };
    const r = evalA02(minutes, now, 11, p);
    expect(r.hit).toBe(true);
    expect(r.value).toBeGreaterThanOrEqual(24);
    expect(evalA02(minutes, now, 17, p).hit).toBeNull();
    expect(evalA02(minutes.slice(0, 70), new Date(now.getTime()), 11, p).hit).toBeNull(); // contador parou de mandar: não é esteira parada
  });
  it("cartão de hoje", () => {
    const t = liveToday({ eggs: 36000, birds: 100000, hoursOfCount: 4, water: 800, waterRef: 1000, tempMax: 31, deaths: 12, deathsMedian: 6, feedKg: null });
    expect(t.boxes).toBe(100);
    expect(t.posturePartial).toBeCloseTo(36);
    expect(t.waterRatio).toBeCloseTo(0.8);
    expect(t.deathsVsMedian).toBe(2);
  });
});
