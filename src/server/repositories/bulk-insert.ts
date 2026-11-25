/** Inserção em lotes no servidor (avanço diário), ignorando linhas que já existem. */
import type { getSql } from "@/db/client";

type Sql = ReturnType<typeof getSql>;
export type Row = Record<string, unknown>;

/** Colunas jsonb que guardam listas (não são arrays do Postgres). */
const JSON_ARRAY_COLS = new Set(["fields_schema", "hypotheses", "similar_cases", "options", "content", "snapshot"]);

function pgArray(v: unknown[]): string {
  return `{${v.map((x) => (x === null ? "NULL" : typeof x === "string" ? `"${x.replace(/"/g, '\\"')}"` : String(x))).join(",")}}`;
}

function prep(r: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(r)) {
    if (v !== null && typeof v === "object" && !(v instanceof Date)) out[k] = Array.isArray(v) && !JSON_ARRAY_COLS.has(k) ? pgArray(v) : JSON.stringify(v);
    else out[k] = v;
  }
  return out;
}

export async function insertRows(sql: Sql, table: string, rows: Row[], batch = 2000): Promise<number> {
  if (!rows.length) return 0;
  const cols = Object.keys(rows[0]);
  let n = 0;
  for (let i = 0; i < rows.length; i += batch) {
    const chunk = rows.slice(i, i + batch).map(prep);
    const r = await sql`insert into ${sql(`app.${table}`)} ${sql(chunk as never, cols)} on conflict do nothing returning 1`;
    n += r.length;
  }
  return n;
}
