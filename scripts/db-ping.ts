import "./env";
import postgres from "postgres";
import { normalizeDbUrl } from "../src/db/url";

/** Testa a conexão e explica, sem mostrar a senha, o que há de errado com as strings coladas. */
async function check(name: "DIRECT_URL" | "DATABASE_URL"): Promise<boolean> {
  const raw = process.env[name];
  if (!raw) {
    console.log(`– ${name}: não configurada`);
    return name === "DATABASE_URL" ? false : true;
  }
  const c = normalizeDbUrl(raw);
  if (c.problems.length) console.log(`! ${name}: ${c.problems.join("; ")}`);
  if (!c.url) {
    console.error(`✗ ${name} inválida. Copie de novo em Supabase → Connect → ${name === "DIRECT_URL" ? "Session pooler (porta 5432)" : "Transaction pooler (porta 6543)"} e troque [YOUR-PASSWORD] pela senha.`);
    return false;
  }
  console.log(`  ${name}: servidor ${c.host}, porta ${c.port ?? "—"}`);
  const supa = /supabase/.test(c.host ?? "");
  if (supa && name === "DIRECT_URL" && c.port === "6543") console.log("! DIRECT_URL está com a porta 6543 (Transaction pooler); o certo é a 5432 (Session pooler).");
  if (supa && name === "DATABASE_URL" && c.port === "5432") console.log("! DATABASE_URL está com a porta 5432; o certo para a Vercel é a 6543 (Transaction pooler).");
  const sql = postgres(c.url, { prepare: false, max: 1, connect_timeout: 15 });
  try {
    const t0 = Date.now();
    const [{ version }] = await sql`select version()`;
    console.log(`✓ ${name}: conectado em ${Date.now() - t0} ms — ${String(version).split(",")[0]}`);
    return true;
  } catch (e) {
    const msg = (e as Error).message;
    console.error(`✗ ${name}: falha ao conectar (${msg})${/password|authentication/i.test(msg) ? " — a senha não confere: confira a senha do banco no Supabase" : ""}`);
    return false;
  } finally {
    await sql.end({ timeout: 2 });
  }
}

(async () => {
  const a = await check("DIRECT_URL");
  const b = await check("DATABASE_URL");
  process.exit(a && b ? 0 : 1);
})();
