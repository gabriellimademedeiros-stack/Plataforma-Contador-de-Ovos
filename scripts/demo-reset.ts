import "./env";
import { createScriptDb } from "../src/db/client";
import { resolveCalendar } from "../src/simulator/calendar";
import { runMigrations } from "./lib/migrate";
import { truncateAll } from "./lib/db-write";
import { seedBase } from "./lib/seed-base";
import { runPipelineAfterBase } from "./lib/pipeline";

async function step<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  console.log(`▶ ${name}…`);
  const r = await fn();
  console.log(`  ok (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  return r;
}

async function main() {
  const t0 = Date.now();
  const cal = resolveCalendar();
  const demoPassword = process.env.DEMO_PASSWORD;
  if (!demoPassword) throw new Error("DEMO_PASSWORD não configurada no .env.local");
  console.log(`Semente ${cal.seed} · D_start ${cal.dStart} · D_end ${cal.dEnd}`);

  await step("1. Migrações", runMigrations);
  const { sql, db } = createScriptDb(5);
  try {
    await step("2. Esvaziando tabelas", () => truncateAll(sql));
    const base = await step("3. Base (empresa, usuários, galpões, linhagens, catálogos)", () =>
      seedBase(sql, { demoPassword, dStart: cal.dStart }),
    );
    console.log("   ", Object.entries(base).map(([k, v]) => `${k}=${v}`).join(" "));
    await runPipelineAfterBase({ sql, db, cal, step });
  } finally {
    await sql.end();
    // conexão usada pelos serviços do app (relatórios)
    await globalThis.__ovosSql?.end({ timeout: 2 });
  }
  console.log(`\n✓ Reset completo em ${((Date.now() - t0) / 1000 / 60).toFixed(1)} min`);
}

main().catch((e) => {
  console.error("\n✗ Falha no reset:", e);
  process.exit(1);
});
