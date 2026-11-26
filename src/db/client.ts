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
 * Cliente do app (Next.js / Vercel): Transaction pooler do Supabase (DATABASE_URL, porta 6543), feito para funções
 * serverless (sem o limite de 15 clientes do Session pooler). `max_pipeline: 1` é obrigatório: com consultas
 * enfileiradas na mesma conexão (pipelining) o Transaction pooler deixa de responder (ver DECISOES).
 */
export function getDb(): DB {
  if (!globalThis.__ovosDb) {
    const raw = process.env.DATABASE_URL || process.env.DIRECT_URL;
    if (!raw) throw new Error("DATABASE_URL não configurada (veja .env.example).");
    const url = dbUrlFrom(process.env.DATABASE_URL ? "DATABASE_URL" : "DIRECT_URL", raw);
    const isProd = process.env.NODE_ENV === "production";
    const sql = postgres(url, {
      prepare: false,
      max_pipeline: 1,
      max: isProd ? 4 : 5,
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
  const sql = postgres(url, { prepare: false, max_pipeline: 1, max, onnotice: () => {}, connect_timeout: 20 });
  return { sql, db: drizzle(sql, { schema }) as DB };
}
