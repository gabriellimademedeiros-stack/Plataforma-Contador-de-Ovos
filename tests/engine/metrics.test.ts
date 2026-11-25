import { describe, expect, it } from "vitest";
import { computeAllMetrics } from "@/engine/metrics/pipeline";
import { aggregate } from "@/engine/metrics/compute";
import { financeDay, fixedCostPerDay, breakEvenPosture } from "@/engine/finance/daily";
import { tinyDataset, counts } from "./fixtures";

const r = computeAllMetrics(tinyDataset());
const g = (house: string, m: string, d = "2026-01-04") => r.store.get(house, m, d);

describe("indicadores diários (valores calculados à mão)", () => {
  it("1. ovos produzidos = soma de todas as classes e pistas", () => expect(g("H1", "prod.ovos")).toBe(800));
  it("2. caixas = ovos ÷ 360", () => expect(g("H1", "prod.caixas")).toBeCloseTo(800 / 360, 9));
  it("3. postura = ovos ÷ aves × 100", () => expect(g("H1", "prod.postura")).toBeCloseTo(80, 9));
  it("4. aproveitamento = (limpos + indeterminados) ÷ ovos", () => expect(g("H1", "prod.aproveitamento")).toBeCloseTo((752 / 800) * 100, 9));
  it("5. trincados", () => expect(g("H1", "qual.trincados")).toBeCloseTo((30 / 800) * 100, 9));
  it("6. quebrados", () => expect(g("H1", "qual.quebrados")).toBeCloseTo((6 / 800) * 100, 9));
  it("7. sujos de fezes", () => expect(g("H1", "qual.sujos_fezes")).toBeCloseTo((10 / 800) * 100, 9));
  it("8. sujos de sangue", () => expect(g("H1", "qual.sujos_sangue")).toBeCloseTo((2 / 800) * 100, 9));
  it("9. avarias = trincados + quebrados", () => expect(g("H1", "qual.avarias")).toBeCloseTo((36 / 800) * 100, 9));
  it("10. indeterminados", () => expect(g("H1", "qual.indeterminados")).toBeCloseTo((2 / 800) * 100, 9));
  it("11. trincados por pista", () => {
    expect(g("H1", "qual.trincados_pista1")).toBeCloseTo((20 / 400) * 100, 9);
    expect(g("H1", "qual.trincados_pista2")).toBeCloseTo((10 / 400) * 100, 9);
  });
  it("12. razão entre pistas das avarias", () => expect(g("H1", "qual.razao_pistas")).toBeCloseTo(24 / 12, 9));
  it("13. mortalidade diária = mortes ÷ aves × 100", () => expect(g("H1", "mort.diaria")).toBeCloseTo(0.2, 9));
  it("14. mortalidade acumulada desde o alojamento", () => expect(g("H1", "mort.acumulada", "2026-01-05")).toBeCloseTo((3 / 1000) * 100, 9));
  it("15. viabilidade = aves presentes ÷ alojadas", () => expect(g("H1", "mort.viabilidade")).toBeCloseTo(99.8, 9));
  it("16. ovo por ave alojada acumulado", () => expect(g("H1", "prod.oaa", "2026-01-05")).toBeCloseTo((800 + 798) / 1000, 9));
  it("17. ração em g/ave/dia", () => expect(g("H1", "nut.racao")).toBeCloseTo(110, 9));
  it("18. água em mL/ave/dia", () => expect(g("H1", "nut.agua")).toBeCloseTo(210, 9));
  it("19. relação água:ração", () => expect(g("H1", "nut.agua_racao")).toBeCloseTo(210 / 110, 9));
  it("20. conversão por dúzia", () => expect(g("H1", "nut.conv_dz")).toBeCloseTo(110 / (800 / 12), 9));
  it("21. conversão por massa", () => expect(g("H1", "nut.conv_massa")).toBeCloseTo(110 / ((800 * 60) / 1000), 9));
  it("22. massa de ovo = postura × peso ÷ 100", () => expect(g("H1", "prod.massa")).toBeCloseTo((80 * 60) / 100, 9));
  it("23. peso corporal e uniformidade da última pesagem", () => {
    expect(g("H1", "nut.peso_corporal")).toBe(1600);
    expect(g("H1", "nut.uniformidade")).toBe(86);
  });
  it("24. ambiência e diferença de resfriamento", () => {
    expect(g("H1", "amb.temp_max")).toBe(33.2);
    expect(g("H1", "amb.horas_32")).toBe(2);
    expect(g("H1", "amb.delta_resfriamento")).toBeCloseTo(36 - 33.2, 9);
  });
  it("25. laboratório (última amostra)", () => expect(g("H1", "lab.resistencia")).toBe(3.9));
  it("26. perda por defeitos", () => {
    const loss = ((5.4 - 3.0) * 30 + (5.4 - 4.0) * 12 + 5.4 * 6) / 12;
    expect(g("H1", "qual.perda_brl")).toBeCloseTo(loss, 9);
  });
  it("27. dado ausente vira nulo com quality_flag 2, nunca zero", () => {
    expect(g("H2", "amb.temp_max")).toBeNull();
    expect(r.store.quality("H2", "amb.temp_max", "2026-01-04")).toBe(2);
  });
});

describe("regra de agregação (Parte 4.6)", () => {
  it("postura da granja = Σ ovos ÷ Σ aves, nunca a média das posturas", () => {
    const farm = r.farmDaily.find((x) => x.key === "2026-01-04" && x.metric === "prod.postura")!;
    const correct = ((800 + 2100) / (1000 + 3000)) * 100; // 72,5%
    const wrongAverage = (80 + 70) / 2; // 75%
    expect(farm.value).toBeCloseTo(correct, 9);
    expect(farm.value).not.toBeCloseTo(wrongAverage, 3);
  });
  it("semana: postura = Σ ovos ÷ Σ aves-dia", () => {
    const w = r.weekly.find((x) => x.house === "H1" && x.metric === "prod.postura")!;
    expect(w.value).toBeCloseTo(((800 + 798) / (1000 + 998)) * 100, 9);
    expect(w.daysCount).toBe(2);
  });
  it("mortalidade semanal = Σ mortes ÷ aves no início da semana", () => {
    const w = r.weekly.find((x) => x.house === "H1" && x.metric === "mort.diaria")!;
    expect(w.value).toBeCloseTo((3 / 1000) * 100, 9);
  });
  it("ração da semana ponderada por aves-dia", () => {
    const w = r.weekly.find((x) => x.house === "H1" && x.metric === "nut.racao")!;
    expect(w.value).toBeCloseTo(((110 + 109.78) * 1000) / (1000 + 998), 9);
  });
  it("totais somam e 'último' usa o último dia", () => {
    expect(r.weekly.find((x) => x.house === "H1" && x.metric === "prod.ovos")!.value).toBe(1598);
    expect(r.weekly.find((x) => x.house === "H1" && x.metric === "prod.oaa")!.value).toBeCloseTo(1.598, 9);
  });
  it("função aggregate", () => {
    const cells = [
      { value: 50, num: 1, den: 2 },
      { value: 100, num: 9, den: 9 },
    ];
    expect(aggregate("prod.postura", "razao", cells).value).toBeCloseTo((10 / 11) * 100, 9);
    expect(aggregate("x", "soma", cells).value).toBe(150);
    expect(aggregate("x", "max", cells).value).toBe(100);
    expect(aggregate("x", "ultimo", cells).value).toBe(100);
  });
});

describe("financeiro diário (Parte 12.1)", () => {
  const cost = tinyDataset().costParams;
  const prices = tinyDataset().prices[0];
  it("receita por destino, custos e margem", () => {
    const f = financeDay({ counts: counts({ clean: 1188, undetermined: 12, cracked: 24, dirty_feces: 12, broken: 12 }), feedKg: 130, birds: 1500, birdsHoused: 1600, plannedDays: 511, prices, cost });
    expect(f.eggs).toBe(1248);
    expect(f.dzClean).toBe(100);
    expect(f.receita).toBeCloseTo(100 * 5.4 + 2 * 3.0 + 1 * 4.0, 9);
    expect(f.custoRacao).toBeCloseTo(260, 9);
    expect(f.custoEmbalagem).toBeCloseTo(35, 9);
    expect(f.custoOverhead).toBeCloseTo(104 * 0.25, 9);
    expect(f.custoFixo).toBeCloseTo(fixedCostPerDay(cost), 9);
    expect(f.custoAve).toBeCloseTo((1600 * (28 - 6)) / 511, 9);
    expect(f.custoSanidade).toBeCloseTo((1500 * 0.02) / 7, 9);
    expect(f.margem).toBeCloseTo(f.receita - f.custo, 9);
    expect(f.margemDz).toBeCloseTo(f.margem / 104, 9);
  });
  it("custo fixo diário = (mão de obra + energia + depreciação) × 12 ÷ 365", () => {
    expect(fixedCostPerDay(cost)).toBeCloseTo((36000 * 12) / 365, 9);
  });
  it("postura de equilíbrio sobre totais", () => {
    expect(breakEvenPosture(900, 1000, 800, 1000)).toBeCloseTo(72, 9);
  });
});
