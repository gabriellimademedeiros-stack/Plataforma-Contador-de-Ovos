import type postgres from "postgres";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

type Sql = ReturnType<typeof postgres>;
export type Row = Record<string, unknown>;

/** Insere em lotes (padrão 2.000 linhas) usando o helper de múltiplas linhas do postgres-js. */
export async function insertBatched(sql: Sql, table: string, rows: Row[], batch = 2000): Promise<number> {
  if (rows.length === 0) return 0;
  const cols = Object.keys(rows[0]);
  for (let i = 0; i < rows.length; i += batch) {
    const chunk = rows.slice(i, i + batch).map((r) => prepRow(sql, r));
    await sql`insert into ${sql(`app.${table}`)} ${sql(chunk as never, cols)}`;
  }
  return rows.length;
}

/** jsonb vai como sql.json; arrays como literal de array do Postgres. */
function prepRow(sql: Sql, r: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(r)) {
    if (v !== null && typeof v === "object" && !(v instanceof Date)) {
      out[k] = Array.isArray(v) && !k.endsWith("_json") && !JSON_ARRAY_COLS.has(k) ? pgArray(v) : JSON.stringify(v);
    } else out[k] = v;
  }
  return out;
}

/** Colunas jsonb que guardam listas (não são arrays do Postgres). */
const JSON_ARRAY_COLS = new Set(["fields_schema", "hypotheses", "similar_cases", "options", "content", "snapshot"]);

function pgArray(v: unknown[]): string {
  return `{${v.map((x) => (x === null ? "NULL" : typeof x === "string" ? `"${x.replace(/"/g, '\\"')}"` : String(x))).join(",")}}`;
}

function copyValue(v: unknown): string {
  if (v === null || v === undefined) return "\\N";
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) {
    return `{${v.map((x) => (x === null ? "NULL" : typeof x === "string" ? `"${x.replace(/"/g, '\\"')}"` : String(x))).join(",")}}`;
  }
  if (typeof v === "object") return JSON.stringify(v).replace(/\\/g, "\\\\").replace(/\t/g, "\\t").replace(/\n/g, "\\n");
  if (typeof v === "boolean") return v ? "t" : "f";
  return String(v).replace(/\\/g, "\\\\").replace(/\t/g, "\\t").replace(/\n/g, "\\n").replace(/\r/g, "\\r");
}

/**
 * Grava muitas linhas com COPY FROM STDIN (muito mais rápido que INSERT para tabelas grandes).
 * Todas as linhas precisam ter as mesmas colunas.
 */
export async function copyRows(sql: Sql, table: string, rows: Row[]): Promise<number> {
  if (rows.length === 0) return 0;
  const cols = Object.keys(rows[0]);
  const colList = cols.map((c) => `"${c}"`).join(", ");
  const writable = await sql.unsafe(`copy app.${table} (${colList}) from stdin`).writable();
  const CHUNK = 5000;
  let i = 0;
  const source = new Readable({
    read() {
      if (i >= rows.length) {
        this.push(null);
        return;
      }
      const end = Math.min(rows.length, i + CHUNK);
      let buf = "";
      for (; i < end; i++) {
        const r = rows[i];
        buf += cols.map((c) => copyValue(r[c])).join("\t") + "\n";
      }
      this.push(buf);
    },
  });
  await pipeline(source, writable);
  return rows.length;
}

export async function truncateAll(sql: Sql) {
  const tables = await sql<{ tablename: string }[]>`
    select tablename from pg_tables where schemaname = 'app' and tablename <> '__drizzle_migrations'`;
  if (tables.length === 0) return;
  await sql.unsafe(`truncate ${tables.map((t) => `app."${t.tablename}"`).join(", ")} restart identity cascade`);
}
