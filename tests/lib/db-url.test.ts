import { describe, expect, it } from "vitest";
import { normalizeDbUrl } from "@/db/url";

describe("string de conexão colada do Supabase", () => {
  const base = "postgresql://postgres.abc:SENHA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres";
  it("aceita a string correta", () => expect(normalizeDbUrl(base).url).toBe(base));
  it("tira quebra de linha, espaços e aspas", () => expect(normalizeDbUrl(`  "${base}"\n`).url).toBe(base));
  it("remove colchetes em volta da senha", () => expect(normalizeDbUrl(base.replace("SENHA", "[SENHA]")).url).toBe(base));
  it("codifica símbolos na senha", () => expect(normalizeDbUrl(base.replace("SENHA", "a@b#c/d?")).url).toContain(":a%40b%23c%2Fd%3F@aws-0"));
  it("avisa quando sobrou [YOUR-PASSWORD]", () => expect(normalizeDbUrl(base.replace("SENHA", "[YOUR-PASSWORD]")).problems.join()).toMatch(/YOUR-PASSWORD/));
  it("explica quando não é uma URL", () => expect(normalizeDbUrl("aws-0-sa-east-1.pooler.supabase.com").problems.join()).toMatch(/postgresql:\/\//));
});
