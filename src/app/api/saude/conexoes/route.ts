import { NextResponse } from "next/server";
import postgres from "postgres";
import { normalizeDbUrl } from "@/db/url";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const withTimeout = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`sem resposta em ${ms / 1000} s`)), ms))]);

/** Diagnóstico das duas strings de conexão (sem segredos): consulta simples, com parâmetro e em paralelo. */
async function probe(raw: string | undefined, pipeline: number) {
  const c = normalizeDbUrl(raw);
  if (!c.url) return { configurada: !!raw, problemas: c.problems };
  const sql = postgres(c.url, { prepare: false, max: 1, connect_timeout: 8, idle_timeout: 1, max_pipeline: pipeline, onnotice: () => {} });
  const out: Record<string, unknown> = { servidor: c.host, porta: c.port, problemas: c.problems };
  for (const [name, fn] of [
    ["simples", () => sql`select 1 as x`],
    ["com_parametro", () => sql`select count(*)::int as n from app.users where email like ${"%@demo.local"} and created_at > now() - make_interval(days => ${36500})`],
    ["paralelo", () => Promise.all([sql`select 1`, sql`select ${2}::int`, sql`select count(*) from app.houses where code = ${"P001"}`])],
  ] as const) {
    const t0 = Date.now();
    try {
      await withTimeout((fn as () => Promise<unknown>)(), 8000);
      out[name] = `ok (${Date.now() - t0} ms)`;
    } catch (e) {
      out[name] = `falhou: ${(e as Error).message}`;
    }
  }
  await withTimeout(sql.end({ timeout: 1 }), 3000).catch(() => {});
  return out;
}

export async function GET(req: Request) {
  const pipe = Number(new URL(req.url).searchParams.get("pipeline") ?? 100);
  const [transacao, sessao] = await Promise.all([probe(process.env.DATABASE_URL, pipe), probe(process.env.DIRECT_URL, pipe)]);
  return NextResponse.json({ max_pipeline: pipe, DATABASE_URL: transacao, DIRECT_URL: sessao });
}
