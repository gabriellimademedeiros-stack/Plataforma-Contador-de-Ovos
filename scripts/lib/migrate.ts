import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createScriptDb } from "../../src/db/client";

/**
 * Aplica as migrações e garante RLS em todas as tabelas do schema app
 * (inclusive tabelas criadas por migrações futuras).
 */
export async function runMigrations() {
  const { sql, db } = createScriptDb(1);
  try {
    await migrate(db, { migrationsFolder: "src/db/migrations", migrationsSchema: "app" });
    await sql.unsafe(`DO $$ DECLARE r record; BEGIN
      FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'app' LOOP
        EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY', r.tablename);
      END LOOP; END $$;`);
  } finally {
    await sql.end();
  }
}
