import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type DB = PostgresJsDatabase<typeof schema>;

declare global {
  var __ovosSql: ReturnType<typeof postgres> | undefined;
  var __ovosDb: DB | undefined;
}

/**
 * Cliente do app (Next.js / Vercel). Usa o Transaction pooler: prepare=false e poucas conexões.
 */
export function getDb(): DB {
  if (!globalThis.__ovosDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL não configurada (veja .env.example).");
    const isProd = process.env.NODE_ENV === "production";
    const sql = postgres(url, {
      prepare: false,
      max: isProd ? 1 : 5,
      idle_timeout: 20,
      connect_timeout: 15,
      onnotice: () => {},
    });
    globalThis.__ovosSql = sql;
    globalThis.__ovosDb = drizzle(sql, { schema });
  }
  return globalThis.__ovosDb;
}

export function getSql() {
  getDb();
  return globalThis.__ovosSql!;
}

/** Cliente dos scripts locais (Session pooler / conexão direta). */
export function createScriptDb(max = 5) {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("DIRECT_URL não configurada (veja .env.example).");
  const sql = postgres(url, { prepare: false, max, onnotice: () => {}, connect_timeout: 20 });
  return { sql, db: drizzle(sql, { schema }) as DB };
}
