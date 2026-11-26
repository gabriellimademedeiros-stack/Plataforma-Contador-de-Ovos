import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { dbUrlFrom } from "./url";
import * as schema from "./schema";

export type DB = PostgresJsDatabase<typeof schema>;

declare global {
  var __ovosSql: ReturnType<typeof postgres> | undefined;
  var __ovosDb: DB | undefined;
}

/**
 * Cliente do app (Next.js / Vercel). Usa o Session pooler do Supabase (DIRECT_URL, porta 5432) quando existir:
 * no Transaction pooler (porta 6543) as consultas com parâmetros ficavam paradas (ver DECISOES). Poucas conexões
 * e encerramento rápido das ociosas, para caber no limite do plano gratuito.
 */
export function getDb(): DB {
  if (!globalThis.__ovosDb) {
    const raw = process.env.DIRECT_URL || process.env.DATABASE_URL;
    if (!raw) throw new Error("DATABASE_URL não configurada (veja .env.example).");
    const url = dbUrlFrom(process.env.DIRECT_URL ? "DIRECT_URL" : "DATABASE_URL", raw);
    const isProd = process.env.NODE_ENV === "production";
    const sql = postgres(url, {
      prepare: false,
      max: isProd ? 2 : 5,
      idle_timeout: isProd ? 10 : 20,
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
  const raw = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!raw) throw new Error("DIRECT_URL não configurada (veja .env.example).");
  const url = dbUrlFrom(process.env.DIRECT_URL ? "DIRECT_URL" : "DATABASE_URL", raw);
  const sql = postgres(url, { prepare: false, max, onnotice: () => {}, connect_timeout: 20 });
  return { sql, db: drizzle(sql, { schema }) as DB };
}
