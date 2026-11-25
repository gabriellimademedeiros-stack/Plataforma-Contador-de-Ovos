/**
 * Relatórios, comparativos e laboratório (M11). Os testes com banco rodam só com a demonstração carregada localmente.
 */
import { config } from "dotenv";
import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { conclusions, whatChanged } from "@/engine/text/report";
import { scopeForUser, type Scope } from "@/server/permissions";

config({ path: ".env.local", quiet: true });

async function demoDbReady(): Promise<boolean> {
  const url = process.env.DATABASE_URL;
  if (!url) return false;
  const sql = postgres(url, { prepare: false, max: 1, connect_timeout: 3, onnotice: () => {} });
  try {
    const [r] = await sql`select count(*)::int as n from app.weekly_metrics`;
    return r.n > 0;
  } catch {
    return false;
  } finally {
    await sql.end({ timeout: 1 });
  }
}
const hasDb = await demoDbReady();

describe("textos determinísticos dos relatórios", () => {
  it("3 frases do que mudou", () => {
    const t = whatChanged({ posture: 85.2, posturePrev: 84.8, mort: 0.08, mortPrev: 0.13, defects: 4.46, defectsPrev: 4.36, margin: 175000, marginPrev: 185000, worstHouse: { house: "P003", dev: -4.7 }, bestHouse: { house: "P002", dev: 2.1 }, openAlerts: 4, newAlerts: 6, negativeMargin: ["P007"] });
    expect(t).toHaveLength(3);
    expect(t[0]).toContain("85,2%");
    expect(t[0]).toContain("+0,4 p.p.");
    expect(t[1]).toContain("P003");
    expect(t[2]).toContain("P007");
  });
  it("conclusões com pontos de atenção e sugestões", () => {
    const c = conclusions({ worsened: [{ label: "Trincados", detail: "2,23 → 2,26" }], improved: [{ label: "Postura", detail: "84,8 → 85,2" }], criticalAlerts: [], negativeMargin: ["P007"], belowStandard: ["P003"] });
    expect(c.attention.join(" ")).toContain("Trincados");
    expect(c.suggestions.some((s) => s.includes("descarte"))).toBe(true);
  });
});

describe.skipIf(!hasDb)("relatórios e comparativos (banco local)", async () => {
  const { getSql } = await import("@/db/client");
  const { getHouses, getRefDate } = await import("@/server/repositories/reference");
  const { buildWeeklyReport } = await import("@/server/services/reports/weekly");
  const { buildComparativeReport } = await import("@/server/services/reports/comparative");
  const { runComparison } = await import("@/server/services/comparisons");
  const { lastCompleteWeekStart } = await import("@/lib/dates");
  const { fmtNumber } = await import("@/lib/format");

  async function scopeOf(email: string): Promise<Scope> {
    const [u] = await getSql()`select id, email, name, role, allowed_house_ids from app.users where email = ${email}`;
    return scopeForUser({ id: u.id, email: u.email, name: u.name, role: u.role, allowedHouseIds: u.allowed_house_ids ?? null }, await getHouses());
  }

  it("Relatório Semanal tem 11 páginas e a postura da granja = soma ÷ soma", async () => {
    const ws = lastCompleteWeekStart(await getRefDate());
    const m = await buildWeeklyReport(await scopeOf("diretor@demo.local"), ws);
    expect(m.pages.map((p) => p.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    const [f] = await getSql()`select value from app.farm_weekly_metrics where metric_code = 'prod.postura' and week_start = ${ws}`;
    const kpis = m.pages[0].blocks.find((b) => b.type === "kpis");
    const post = kpis && kpis.type === "kpis" ? kpis.items.find((k) => k.label.startsWith("Postura"))!.value : "";
    expect(post).toBe(`${fmtNumber(Number(f.value), 1)}%`);
    expect(JSON.stringify(m.pages[8])).toContain("Estimado");
  });

  it("Relatório Comparativo tem 9 páginas; versão do encarregado sem finanças nem outros galpões", async () => {
    const ws = lastCompleteWeekStart(await getRefDate());
    const c = await buildComparativeReport(await scopeOf("diretor@demo.local"), ws);
    expect(c.pages).toHaveLength(9);
    const e = await buildWeeklyReport(await scopeOf("encarregado@demo.local"), ws, "perfil");
    const txt = JSON.stringify(e.pages.filter((p) => p.n !== 11));
    expect(txt).not.toMatch(/R\$ ?\d/);
    expect(txt).not.toMatch(/"P00[5-8]"/);
  });

  it("comparativo lote × lote na mesma idade", async () => {
    const r = await runComparison(await scopeOf("gerente@demo.local"), { tipo: "lotes", itens: ["L105", "L011"], metrica: "prod.postura", eixo: "idade" });
    expect(r.tabela).toHaveLength(2);
    expect(r.tabela[0].detalhe).toMatch(/semanas \d+ a \d+/);
    expect(r.tabela[0].n).toBe(r.tabela[1].n);
    expect(r.spec.kind).toBe("age");
  });
});
