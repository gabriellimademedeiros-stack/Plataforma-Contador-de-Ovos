/**
 * M12: cenários ao vivo, ingestão do contador, campo e prévia de regra (com o banco local da demonstração).
 * Usa horários fixos do dia corrente (14h e 11h) para não depender da hora em que o teste roda; limpa tudo no fim.
 */
import { config } from "dotenv";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
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

describe.skipIf(!hasDb)("demonstração ao vivo (banco local)", async () => {
  const { getSql } = await import("@/db/client");
  const { getHouses } = await import("@/server/repositories/reference");
  const { runLiveScenario, clearLive } = await import("@/server/services/demo-live");
  const { ingestCounterMessage } = await import("@/server/services/ingest");
  const { registerFieldEntry } = await import("@/server/services/field");
  const { previewRule } = await import("@/server/services/settings");
  const { currentProductiveDate, farmInstant } = await import("@/lib/dates");
  const today = currentProductiveDate();
  // horário fixo dentro do dia produtivo corrente (06h de hoje até 05h59 de amanhã)
  const at = (h: number, m = 0) => farmInstant(today, h, m);

  async function scopeOf(email: string): Promise<Scope> {
    const [u] = await getSql()`select id, email, name, role, allowed_house_ids from app.users where email = ${email}`;
    return scopeForUser({ id: u.id, email: u.email, name: u.name, role: u.role, allowedHouseIds: u.allowed_house_ids ?? null }, await getHouses());
  }

  afterAll(async () => {
    await clearLive();
  });

  it("falha de bebedouro ao vivo abre A08h em menos de 10 s, com notificação", async () => {
    const t0 = Date.now();
    const r = await runLiveScenario("bebedouro", "P006", at(14));
    const ms = Date.now() - t0;
    const a = r.recompute.opened.find((x) => x.rule === "A08h" && x.house === "P006");
    expect(a).toBeTruthy();
    expect(ms).toBeLessThan(10_000);
    const [n] = await getSql()`select count(*)::int as n from app.notifications where alert_id = ${a!.id}`;
    expect(n.n).toBe(1);
  });

  it("pico de temperatura abre A11 e esteira parada abre A02 (entre 06h e 16h)", async () => {
    const t = await runLiveScenario("temperatura", "P006", at(14));
    expect(t.recompute.opened.some((x) => x.rule === "A11")).toBe(true);
    const e = await runLiveScenario("esteira", "P006", at(11));
    expect(e.recompute.opened.some((x) => x.rule === "A02")).toBe(true);
  });

  it("ingestão: grava, ignora duplicada e recusa dispositivo de outro galpão", async () => {
    const now = new Date();
    const ws = new Date(Math.floor(now.getTime() / 60_000) * 60_000 - 60_000).toISOString();
    const msg = { message_id: `TEST-CNT-0008-1-${now.getTime()}`, device_code: "CNT-0008", house_code: "P008", lane: 1 as const, window_start: ws, window_minutes: 1 as const, model_version: "egg-cls-1.4.2", counts: { clean: 371, dirty_feces: 6, dirty_blood: 2, cracked: 4, broken: 1, undetermined: 3 }, mean_confidence: 0.75 };
    const a = await ingestCounterMessage(msg, now);
    expect(a.duplicate).toBe(false);
    expect(a.quality_flag).toBe(1);
    const b = await ingestCounterMessage(msg, now);
    expect(b.duplicate).toBe(true);
    await expect(ingestCounterMessage({ ...msg, message_id: `${msg.message_id}-x`, house_code: "P001" }, now)).rejects.toThrow(/não está atribuído/);
    await expect(ingestCounterMessage({ ...msg, message_id: `${msg.message_id}-f`, window_start: new Date(now.getTime() + 10 * 60_000).toISOString() }, now)).rejects.toThrow(/futuro/);
    const [d] = await getSql()`select status, last_seen_at from app.devices where code = 'CNT-0008'`;
    expect(d.status).toBe("online");
    await getSql()`delete from app.egg_counts where message_id like 'TEST-%'`;
  });

  it("campo: mortalidade alta abre A06; encarregado não registra em galpão fora do escopo", async () => {
    const r = await registerFieldEntry(await scopeOf("gerente@demo.local"), { tipo: "mortalidade", house: "P006", qtd: 200, causa: "desconhecida" });
    expect(r.message).toMatch(/Registrado ✓/);
    expect(r.recompute?.opened.some((a) => a.rule === "A06")).toBe(true);
    await expect(registerFieldEntry(await scopeOf("encarregado@demo.local"), { tipo: "racao", house: "P006", kg: 100 })).rejects.toThrow(/P006/);
  });

  it("prévia da regra mostra o número de disparos nos últimos 90 dias", async () => {
    const strict = await previewRule("A06", { factor: 50, min_pct: 5 });
    const loose = await previewRule("A06", { factor: 1.5, min_pct: 0.02 });
    expect(strict.applicable).toBe(true);
    expect(strict.proposed).toBe(0);
    expect(loose.proposed!).toBeGreaterThan(0);
    expect(loose.proposed!).toBeGreaterThanOrEqual(loose.current!);
    expect((await previewRule("A02", {})).applicable).toBe(false);
  });
});
