import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { generateDataset } from "@/simulator/generate";
import { buildIndex, totalCounts, type Dataset, EGG_CLASSES } from "@/engine/types";
import { distributeInteger } from "@/simulator/hourly";

const D_END = "2026-11-24";
let ds: Dataset;

function digest(d: Dataset) {
  return createHash("sha256").update(JSON.stringify(d)).digest("hex");
}

beforeAll(() => {
  ds = generateDataset({ seed: 20261125, dEnd: D_END });
});

describe("simulador — determinismo", () => {
  it("mesma semente e mesma data final geram o mesmo hash", () => {
    const again = generateDataset({ seed: 20261125, dEnd: D_END });
    expect(digest(again)).toBe(digest(ds));
  });
  it("semente diferente gera dados diferentes", () => {
    const other = generateDataset({ seed: 1, dEnd: D_END, skipHourly: true });
    expect(other.daily[100].deaths === ds.daily[100].deaths && other.daily[100].feedKg === ds.daily[100].feedKg).toBe(false);
  });
  it("estender o período não altera os dias já gerados", () => {
    const ext = generateDataset({ seed: 20261125, dEnd: D_END, to: addDays(D_END, 2), skipHourly: true });
    const a = ds.daily.filter((r) => r.date === "2026-11-20");
    const b = ext.daily.filter((r) => r.date === "2026-11-20");
    expect(b).toEqual(a);
    expect(ext.daily.some((r) => r.date === addDays(D_END, 2))).toBe(true);
  });
});

describe("simulador — consistência", () => {
  it("cobre 3 anos com 8 galpões", () => {
    expect(ds.dStart).toBe("2023-11-25");
    expect(new Set(ds.daily.map((r) => r.house)).size).toBe(8);
    expect(ds.daily.every((r) => r.date >= ds.dStart && r.date <= D_END)).toBe(true);
  });
  it("todos os galpões têm lote ativo nas datas dos cenários", () => {
    const idx = buildIndex(ds);
    for (const off of [-45, -25, -21, -20, -12, -9, -6, -4, 0]) {
      for (const h of ds.houses) expect(idx.daily.get(h.code)?.get(addDays(D_END, off))).toBeDefined();
    }
  });
  it("saldo de aves consistente dia a dia", () => {
    const idx = buildIndex(ds);
    for (const [, m] of idx.daily) {
      const rows = [...m.values()];
      for (let i = 1; i < rows.length; i++) {
        const a = rows[i - 1];
        const b = rows[i];
        if (a.flock !== b.flock) continue;
        expect(b.birdsStart).toBe(a.birdsStart - a.deaths - a.culls);
      }
    }
  });
  it("mortes por causa somam as mortes do dia", () => {
    for (const r of ds.daily.slice(0, 2000)) {
      expect(Object.values(r.deathsByCause).reduce((a, b) => a + b, 0)).toBe(r.deaths);
    }
  });
  it("faixas plausíveis", () => {
    const idx = buildIndex(ds);
    for (const r of ds.daily) {
      const egg = idx.egg.get(r.house)!.get(r.date)!;
      const eggs = totalCounts(egg.lanes[1]) + totalCounts(egg.lanes[2]);
      const post = (eggs / r.birdsStart) * 100;
      expect(post).toBeGreaterThanOrEqual(0);
      expect(post).toBeLessThanOrEqual(99);
      const feed = (r.feedKg! * 1000) / r.birdsStart;
      expect(feed).toBeGreaterThan(60);
      expect(feed).toBeLessThan(130);
      const water = (r.waterL! * 1000) / r.birdsStart;
      expect(water).toBeGreaterThan(100);
      expect(water).toBeLessThan(300);
      expect(r.eggWeightG!).toBeGreaterThan(40);
      expect(r.eggWeightG!).toBeLessThan(72);
      for (const l of [1, 2] as const) for (const c of EGG_CLASSES) expect(egg.lanes[l][c]).toBeGreaterThanOrEqual(0);
    }
    for (const e of ds.env) {
      expect(e.tempMax).toBeGreaterThan(15);
      expect(e.tempMax).toBeLessThan(42);
      expect(e.tempMin).toBeLessThanOrEqual(e.tempMax);
    }
  });
  it("soma das horas do contador bate com o total diário", () => {
    const idx = buildIndex(ds);
    const byKey = new Map<string, number>();
    for (const h of ds.eggHourly) {
      const k = `${h.house}|${h.date}|${h.lane}`;
      byKey.set(k, (byKey.get(k) ?? 0) + totalCounts(h.counts));
    }
    expect(byKey.size).toBe(8 * 30 * 2);
    for (const [k, v] of byKey) {
      const [house, date, lane] = k.split("|");
      expect(v).toBe(totalCounts(idx.egg.get(house)!.get(date)!.lanes[Number(lane) as 1 | 2]));
    }
  });
  it("água horária soma o total diário", () => {
    const idx = buildIndex(ds);
    const sums = new Map<string, number>();
    const day = addDays(D_END, -3);
    for (const s of ds.sensors.filter((x) => x.metric === "nut.agua_litros" && x.house === "P001")) {
      // as 24 horas do dia produtivo D−3 vão de 06h do dia até 05h do dia seguinte
      const t = new Date(s.ts).getTime();
      const start = new Date(`${day}T09:00:00Z`).getTime();
      if (t >= start && t < start + 86400000) sums.set(day, (sums.get(day) ?? 0) + s.value);
    }
    expect(sums.get(day)!).toBeCloseTo(idx.daily.get("P001")!.get(day)!.waterL!, 0);
  });
  it("distribuição inteira exata", () => {
    expect(distributeInteger(10, [1, 1, 1]).reduce((a, b) => a + b)).toBe(10);
    expect(distributeInteger(0, [0.2, 0.8])).toEqual([0, 0]);
  });
});

describe("simulador — efeitos dos cenários", () => {
  const water = (h: string, d: string) => {
    const r = ds.daily.find((x) => x.house === h && x.date === d)!;
    return (r.waterL! * 1000) / r.birdsStart;
  };
  const mean7 = (h: string, d: string) => {
    let s = 0;
    for (let k = 1; k <= 7; k++) s += water(h, addDays(d, -k));
    return s / 7;
  };
  it("S3: água do P006 em D−9 entre 0,55 e 0,65 da média dos 7 dias anteriores", () => {
    const d = addDays(D_END, -9);
    const ratio = water("P006", d) / mean7("P006", d);
    expect(ratio).toBeGreaterThan(0.55);
    expect(ratio).toBeLessThan(0.65);
  });
  it("S1: temperatura externa forçada na onda de calor", () => {
    const ext = ds.env.filter((e) => e.house === null);
    const t = ext.find((e) => e.date === addDays(D_END, -18))!;
    expect(t.tempMax).toBeGreaterThan(39);
    const p5 = ds.env.find((e) => e.house === "P005" && e.date === addDays(D_END, -18))!;
    expect(p5.tempMax).toBeGreaterThan(35);
  });
  it("S5: trincados da pista 2 do P007 bem acima da pista 1", () => {
    const e = ds.eggDaily.find((x) => x.house === "P007" && x.date === addDays(D_END, -2))!;
    const p1 = e.lanes[1].cracked / totalCounts(e.lanes[1]);
    const p2 = e.lanes[2].cracked / totalCounts(e.lanes[2]);
    expect(p2 / p1).toBeGreaterThan(2);
  });
  it("S6: mortes por prolapso no P008", () => {
    const r = ds.daily.find((x) => x.house === "P008" && x.date === addDays(D_END, -15))!;
    expect(r.deathsByCause.prolapso ?? 0).toBeGreaterThan(10);
  });
  it("S9: 190 mortes extras por calor no P002 no dia produtivo D−12", () => {
    const r = ds.daily.find((x) => x.house === "P002" && x.date === addDays(D_END, -12))!;
    expect(r.deathsByCause.calor ?? 0).toBeGreaterThanOrEqual(190);
    const env = ds.env.find((e) => e.house === "P002" && e.date === addDays(D_END, -12))!;
    expect(env.nightMax).toBeGreaterThan(35);
  });
  it("S8: sujos de fezes concentrados na pista 1 do P004", () => {
    const e = ds.eggDaily.find((x) => x.house === "P004" && x.date === addDays(D_END, -1))!;
    expect(e.lanes[1].dirty_feces / (e.lanes[2].dirty_feces || 1)).toBeGreaterThan(1.6);
  });
  it("eventos semeados: S4, S5 e S8 sem evento", () => {
    const sc = new Set(ds.events.map((e) => e.scenario));
    for (const s of ["S1", "S2", "S3", "S6", "S7", "S9", "H1", "H2", "H3", "H4", "H5", "H6"]) expect(sc.has(s)).toBe(true);
    for (const s of ["S4", "S5", "S8"]) expect(sc.has(s)).toBe(false);
  });
  it("previsão de 7 dias com calor forçado em +3 e +4", () => {
    expect(ds.forecast).toHaveLength(7);
    expect(ds.forecast[2].tempMax).toBe(37);
    expect(ds.forecast[3].tempMax).toBe(37.5);
  });
});
