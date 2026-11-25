import { beforeAll, describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { buildRuleContext } from "@/engine/alerts/context";
import { backtest, type EngineAlert } from "@/engine/alerts/engine";
import { groupIncidents } from "@/engine/alerts/incidents";
import { buildIndex } from "@/engine/types";
import { scenarioCatalog, scenarioDates, type ScenarioInfo } from "@/simulator/scenarios";
import { D_END, world } from "./world";

let alerts: EngineAlert[];
let scenarios: ScenarioInfo[];

beforeAll(() => {
  const { ds, m } = world();
  const r = backtest(buildRuleContext(ds, m), addDays(ds.dStart, 30), ds.dEnd, { forecastDay: ds.dEnd });
  alerts = r.alerts;
  const idx = buildIndex(ds);
  scenarios = scenarioCatalog(D_END, scenarioDates({ dEnd: D_END, flocksByHouse: idx.flocksByHouse }), (d) => ds.houses.map((h) => h.code).filter((h) => idx.daily.get(h)?.get(d)));
});

const find = (code: string) => scenarios.find((s) => s.code === code)!;
const inWindow = (s: ScenarioInfo, rule: string, house?: string) =>
  alerts.filter((a) => a.rule === rule && (house ? a.house === house : s.houses.includes(a.house ?? "")) && a.firstDeviationOn >= addDays(s.start, -2) && a.firstDeviationOn <= addDays(s.end, 7));

describe("motor de alertas — cenários (Parte 10.7)", () => {
  it.each(["S1", "S2", "S3", "S4", "S5", "S6", "S8", "S9", "H1", "H2", "H3", "H4", "H5", "H6"])("%s é detectado pela regra esperada", (code) => {
    const s = find(code);
    expect(s.expectedRules.some((r) => inWindow(s, r).length > 0)).toBe(true);
  });
  it("S1: A11 em vários galpões, P005 crítico e A03 no P005", () => {
    const s = find("S1");
    expect(new Set(inWindow(s, "A11").map((a) => a.house)).size).toBeGreaterThanOrEqual(5);
    expect(inWindow(s, "A11", "P005").some((a) => a.severity === "critica")).toBe(true);
    expect(inWindow(s, "A03", "P005").length).toBeGreaterThan(0);
  });
  it("S2: queda de água abre em D−45/D−44 e depois queda de postura", () => {
    const a08 = alerts.find((a) => a.rule === "A08" && a.house === "P003" && a.firstDeviationOn >= addDays(D_END, -46) && a.firstDeviationOn <= addDays(D_END, -43));
    expect(a08).toBeDefined();
    expect(alerts.some((a) => a.rule === "A03" && a.house === "P003" && a.openedOn > a08!.openedOn && a.openedOn <= addDays(D_END, -30))).toBe(true);
  });
  it("S4: A14 nos três galpões do grupo A e incidente de granja", () => {
    const s = find("S4");
    const hs = new Set(inWindow(s, "A14").map((a) => a.house));
    for (const h of ["P001", "P002", "P004"]) expect(hs.has(h)).toBe(true);
    const { incidents } = groupIncidents(alerts);
    expect(incidents.some((i) => i.scope === "granja" && i.alertIds.some((id) => inWindow(s, "A14").some((a) => a.id === id)))).toBe(true);
  });
  it("S5: avarias concentradas na pista 2 do P007", () => {
    const a = inWindow(find("S5"), "A15", "P007")[0];
    expect(a.observed.lane).toBe(2);
  });
  it("S7: vacinação sem alerta", () => {
    const s = find("S7");
    const bad = alerts.filter((a) => a.house === "P002" && ["A03", "A04", "A05", "A08", "A09"].includes(a.rule) && a.firstDeviationOn >= s.start && a.firstDeviationOn <= addDays(s.start, 4));
    expect(bad).toHaveLength(0);
  });
  it("S9: A11 e A06 críticos no P002", () => {
    const s = find("S9");
    expect(inWindow(s, "A06", "P002").some((a) => a.severity === "critica")).toBe(true);
    expect(inWindow(s, "A11", "P002").some((a) => a.severity === "critica")).toBe(true);
  });
  it("P01: aviso preventivo de calor no último dia", () => {
    expect(alerts.some((a) => a.rule === "P01" && a.openedOn === D_END)).toBe(true);
  });
  it("ruído ≤ 3 alertas por galpão por mês", () => {
    const matched = new Set<string>();
    for (const s of scenarios) for (const a of alerts) if ((a.house == null || s.houses.includes(a.house)) && a.firstDeviationOn >= addDays(s.start, -2) && a.firstDeviationOn <= addDays(s.end, 7)) matched.add(a.id);
    const noise = alerts.filter((a) => !matched.has(a.id) && a.rule !== "P01");
    expect(noise.length / 8 / 35).toBeLessThanOrEqual(3);
  });
});
