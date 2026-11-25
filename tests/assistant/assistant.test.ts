/**
 * Assistente (Parte 13): perguntas sugeridas filtradas por permissão, rótulos de progresso,
 * ferramentas respeitando as permissões do encarregado e o modo reserva reconhecendo as 12 perguntas.
 * Os testes que leem o banco rodam só quando há um Postgres local com a demonstração carregada.
 */
import { config } from "dotenv";
import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { SUGGESTED_QUESTIONS, filterSuggestions } from "@/assistant/suggestions";
import { toolLabel } from "@/assistant/labels";
import { scopeForUser, type Scope } from "@/server/permissions";

config({ path: ".env.local", quiet: true });

async function demoDbReady(): Promise<boolean> {
  const url = process.env.DATABASE_URL;
  if (!url) return false;
  const sql = postgres(url, { prepare: false, max: 1, connect_timeout: 3, onnotice: () => {} });
  try {
    const [r] = await sql`select count(*)::int as n from app.daily_metrics`;
    return r.n > 0;
  } catch {
    return false;
  } finally {
    await sql.end({ timeout: 1 });
  }
}
const hasDb = await demoDbReady();

const ENC_HOUSES = ["P001", "P002", "P003", "P004"];

describe("perguntas sugeridas", () => {
  it("diretor e gerente veem as 12", () => {
    expect(filterSuggestions(["P001", "P002", "P003", "P004", "P005", "P006", "P007", "P008"], true)).toHaveLength(12);
  });
  it("encarregado não vê finanças nem galpões fora do escopo", () => {
    const s = filterSuggestions(ENC_HOUSES, false);
    expect(s.some((q) => /P00[5-8]|L10[5-8]/.test(q))).toBe(false);
    expect(s.some((q) => /preço|manter o L107/.test(q))).toBe(false);
    expect(s).toContain("Quais alertas estão abertos agora?");
    expect(s).toContain("Registra que vacinamos o P002 contra bronquite hoje de manhã.");
  });
  it("rótulos de progresso em linguagem simples", () => {
    expect(toolLabel("consultar_indicador", { metrica: "prod.postura", galpoes: ["P005"] })).toBe("Consultando postura do P005…");
    expect(toolLabel("explicar_anomalia", { galpao: "P007" })).toBe("Analisando causas prováveis do P007…");
  });
});

describe.skipIf(!hasDb)("ferramentas e modo reserva (banco local)", async () => {
  const { getSql } = await import("@/db/client");
  const { getHouses } = await import("@/server/repositories/reference");
  const { runTool } = await import("@/assistant/tools/registry");
  const { fallbackAnswer } = await import("@/assistant/fallback");

  async function scopeOf(email: string): Promise<Scope> {
    const [u] = await getSql()`select id, email, name, role, allowed_house_ids from app.users where email = ${email}`;
    return scopeForUser({ id: u.id, email: u.email, name: u.name, role: u.role, allowedHouseIds: u.allowed_house_ids ?? null }, await getHouses());
  }

  it("encarregado: galpão fora do escopo e finanças são bloqueados nas ferramentas", async () => {
    const ctx = { scope: await scopeOf("encarregado@demo.local") };
    const a = await runTool(ctx, "consultar_indicador", { metrica: "postura", galpoes: ["P005"], inicio: "2026-11-01", fim: "2026-11-21" });
    expect(String(a.erro)).toMatch(/P005/);
    const b = await runTool(ctx, "simular_financeiro", { modo: "cenario_precos", cenario: { ovo_pct: -10 } });
    expect(String(b.erro)).toMatch(/financeir/i);
    const c = await runTool(ctx, "consultar_indicador", { metrica: "margem", galpoes: ["P001"], inicio: "2026-11-01", fim: "2026-11-21" });
    expect(String(c.erro)).toMatch(/financeir/i);
    const ok = await runTool(ctx, "consultar_indicador", { metrica: "postura", galpoes: "todos", inicio: "2026-11-01", fim: "2026-11-21" });
    expect(ok.erro).toBeUndefined();
    expect(Object.keys(ok.resumo_por_galpao as object).sort()).toEqual(ENC_HOUSES);
    const al = await runTool(ctx, "listar_alertas", { situacao: "abertos" });
    expect((al.alertas as Array<{ galpao: string }>).every((x) => ENC_HOUSES.includes(x.galpao) || x.galpao === "granja")).toBe(true);
  });

  it("galpão inexistente gera mensagem clara", async () => {
    const ctx = { scope: await scopeOf("diretor@demo.local") };
    const r = await runTool(ctx, "consultar_indicador", { metrica: "postura", galpoes: ["P009"], inicio: "2026-11-01", fim: "2026-11-21" });
    expect(String(r.erro)).toContain("O galpão P009 não existe");
  });

  it("preparar_evento só monta rascunho (não grava)", async () => {
    const ctx = { scope: await scopeOf("gerente@demo.local") };
    const [before] = await getSql()`select count(*)::int as n from app.events`;
    const r = await runTool(ctx, "preparar_evento", { tipo: "sanitario.vacinacao", galpoes: ["P002"], inicio: "2026-11-25T07:00", titulo: "Vacinação contra bronquite", certeza: "confirmado" });
    const [after] = await getSql()`select count(*)::int as n from app.events`;
    expect(after.n).toBe(before.n);
    expect((r.rascunho as { typeCode: string }).typeCode).toBe("sanitario.vacinacao");
  });

  it("modo reserva reconhece as 12 perguntas sugeridas e chama ferramentas", async () => {
    const ctx = { scope: await scopeOf("diretor@demo.local") };
    for (const q of SUGGESTED_QUESTIONS) {
      const a = await fallbackAnswer(ctx, q, {});
      expect(a.recognized, q).not.toBeNull();
      expect(a.steps.length, q).toBeGreaterThan(0);
      expect(a.steps.every((s) => !s.output.erro), q).toBe(true);
      expect(a.text, q).not.toMatch(/Não consegui/);
    }
  });

  it("modo reserva respeita as permissões do encarregado", async () => {
    const ctx = { scope: await scopeOf("encarregado@demo.local") };
    expect((await fallbackAnswer(ctx, "O que pode estar causando os trincados do P007?", {})).text).toMatch(/não está entre os galpões/);
    expect((await fallbackAnswer(ctx, "Se o preço do ovo cair 10%, quais galpões ficam no vermelho?", {})).text).toMatch(/financeiros/);
    const unk = await fallbackAnswer(ctx, "Qual a cor do céu?", {});
    expect(unk.recognized).toBeNull();
    expect(unk.text).not.toMatch(/P007/);
  });
});
