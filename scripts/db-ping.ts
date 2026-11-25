import "./env";
import postgres from "postgres";

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error("✗ DIRECT_URL/DATABASE_URL não configuradas no .env.local");
    process.exit(1);
  }
  const host = new URL(url).hostname;
  const sql = postgres(url, { prepare: false, max: 1, connect_timeout: 15 });
  try {
    const t0 = Date.now();
    const [{ version }] = await sql`select version()`;
    console.log(`✓ Conectado a ${host} em ${Date.now() - t0} ms`);
    console.log(`  ${version}`);
  } catch (e) {
    console.error(`✗ Falha ao conectar em ${host}: ${(e as Error).message}`);
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}
main();
