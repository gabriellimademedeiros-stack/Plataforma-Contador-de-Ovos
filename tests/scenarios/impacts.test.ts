import { beforeAll, describe, expect, it } from "vitest";
import { computeAllImpacts } from "@/engine/impacts/run";
import type { EventImpactResult } from "@/engine/impacts/impact";
import { world } from "./world";

let imp: Map<string, EventImpactResult>;
const ev = (sc: string) => world().ds.events.find((e) => e.scenario === sc)!;

beforeAll(() => {
  const { ds, m } = world();
  imp = computeAllImpacts(ds, m);
});

describe("retratos de impacto (Parte 9)", () => {
  it("S2: água cai antes da postura, trincados sobem, perda em ovos e galpões de controle", () => {
    const r = imp.get(ev("S2").id)!;
    const row = (m: string) => r.rows.find((x) => x.house === "P003" && x.metric === m && !x.isControl)!;
    expect(row("nut.agua").lagDays!).toBeLessThan(row("prod.postura").lagDays!);
    expect(row("prod.postura").z!).toBeLessThan(-2);
    expect(row("qual.trincados").z!).toBeGreaterThan(2);
    expect(row("prod.postura").lossEggs!).toBeGreaterThan(100000);
    expect(r.allFarm).toBe(false);
    expect(r.rows.some((x) => x.isControl)).toBe(true);
  });
  it("S7: vacinação sem impacto relevante", () => {
    expect(imp.get(ev("S7").id)!.summary).toMatch(/sem impacto relevante/);
  });
  it("S1: onda de calor atinge toda a granja (sem galpão de controle)", () => {
    const r = imp.get(ev("S1").id)!;
    expect(r.allFarm).toBe(true);
    expect(r.fingerprints.length).toBe(8);
  });
  it("S3: queda brusca de água no dia 0", () => {
    const row = imp.get(ev("S3").id)!.rows.find((x) => x.house === "P006" && x.metric === "nut.agua" && !x.isControl)!;
    expect(row.lagDays).toBe(0);
  });
  it("impressão digital tem 12 posições limitadas a ±6", () => {
    for (const r of imp.values()) for (const f of r.fingerprints) {
      expect(f.vector).toHaveLength(12);
      for (const v of f.vector) if (v != null) expect(Math.abs(v)).toBeLessThanOrEqual(6);
    }
  });
});
