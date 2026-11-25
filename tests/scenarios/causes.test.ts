import { beforeAll, describe, expect, it } from "vitest";
import { analyzeAlert, type AlertAnalysis } from "@/engine/causes/analyze";
import type { AlertsWorld } from "../../scripts/lib/alerts-step";
import { runBacktest } from "../../scripts/lib/alerts-step";
import { causeContextFrom, computeAlertInsights } from "../../scripts/lib/insights-step";
import { world } from "./world";

let w: AlertsWorld;
type H = { code: string; score: number; confidence: string };

beforeAll(async () => {
  const { ds, m } = world();
  w = runBacktest(ds, m);
  await computeAlertInsights(ds, m, w);
}, 300_000);

function hyps(sc: string, rule: string, house: string) {
  const a = w.alerts.find((x) => x.rule === rule && x.house === house && w.states!.get(x.id)?.scenario === sc);
  expect(a, `${sc} ${rule} ${house}`).toBeDefined();
  const h = w.hypotheses!.get(a!.id)!;
  return { now: h.hypotheses as H[], open: h.atOpening as H[], similar: h.similar as Array<{ house: string; cause: string; similarity: number }>, alert: a!, dec: h.decomposition as { sentence: string; calor: number } | null };
}

describe("motor de causas — resultados esperados (Parte 11.4)", () => {
  it("S1 (P005, postura): estresse térmico (alta), resfriamento insuficiente em 2º, decomposição com calor", () => {
    const r = hyps("S1", "A03", "P005");
    expect(r.now[0].code).toBe("estresse_termico");
    expect(r.now[0].confidence).toBe("alta");
    expect(r.now[1].code).toBe("resfriamento_insuficiente");
    expect(r.dec!.calor).toBeLessThan(0);
  });
  it("S2 (P003, postura): doença infecciosa (alta), com o caso parecido H3", () => {
    const r = hyps("S2", "A03", "P003");
    expect(r.now[0].code).toBe("doenca_infecciosa");
    expect(r.now[0].confidence).toBe("alta");
    expect(r.similar.some((s) => s.house === "P005" && s.cause === "doenca_infecciosa")).toBe(true);
  });
  it("S3 (P006, água): falha de água (alta)", () => {
    const r = hyps("S3", "A08", "P006");
    expect(r.now[0].code).toBe("falha_agua");
    expect(r.now[0].confidence).toBe("alta");
  });
  it("S4 (trincados, grupo A): nutricional da casca entre as 2 primeiras, com confiança média (ver docs/DECISOES.md)", () => {
    for (const h of ["P001", "P002", "P004"]) {
      const r = hyps("S4", "A14", h);
      const top2 = r.now.slice(0, 2).map((x) => x.code);
      expect(top2).toContain("nutricional_casca");
      expect(r.now.find((x) => x.code === "nutricional_casca")!.confidence).toBe("media");
    }
  });
  it("S5 (P007, trincados): equipamento de coleta (alta) com o caso H6", () => {
    const r = hyps("S5", "A15", "P007");
    expect(r.now[0].code).toBe("equipamento_esteira");
    expect(r.now[0].confidence).toBe("alta");
    expect(r.similar[0].house).toBe("P001");
    expect(r.similar[0].cause).toBe("equipamento_esteira");
  });
  it("S6 (P008, sangue): ovos grandes/prolapso — média antes do evento, alta depois", () => {
    const r = hyps("S6", "A17", "P008");
    expect(r.open[0].code).toBe("ovos_grandes_prolapso");
    expect(r.open[0].confidence).toBe("media");
    expect(r.now[0].code).toBe("ovos_grandes_prolapso");
    expect(r.now[0].confidence).toBe("alta");
  });
  it("S8 (P004, sujos de fezes): vazamento de bebedouro (média) e equipamento em 2º; vira alta com a resposta do encarregado", () => {
    const r = hyps("S8", "A16", "P004");
    expect(r.now[0].code).toBe("vazamento_bebedouro");
    expect(r.now[0].confidence).toBe("media");
    expect(r.now[1].code).toBe("equipamento_esteira");
    const { ds, m } = world();
    const ctx = causeContextFrom(ds, m);
    const after: AlertAnalysis = analyzeAlert(ctx, w.ctx.expected, { house: "P004", anomalyType: "sujos_fezes_alta", a: r.alert.firstDeviationOn, d: ds.dEnd }, { answerHypothesis: "vazamento_bebedouro" });
    expect(after.hypotheses[0].code).toBe("vazamento_bebedouro");
    expect(after.hypotheses[0].confidence).toBe("alta");
  });
  it("S9 (P002, mortalidade): falha de energia ou ventilação (alta), estresse térmico em 2º", () => {
    const r = hyps("S9", "A06", "P002");
    expect(r.now[0].code).toBe("falha_energia_ventilacao");
    expect(r.now[0].confidence).toBe("alta");
    expect(r.now[1].code).toBe("estresse_termico");
  });
  it("sem confirmação humana, a confiança fica no máximo média", () => {
    for (const [, h] of w.hypotheses!) for (const x of h.hypotheses as Array<H & { confirmed: boolean }>) if (!x.confirmed) expect(x.confidence).not.toBe("alta");
  });
});
