import { NextResponse } from "next/server";
import { getSql } from "@/db/client";
import { normalizeDbUrl } from "@/db/url";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Diagnóstico público e sem segredos: o app consegue consultar o banco? Qual conexão está em uso? */
export async function GET() {
  const which = process.env.DATABASE_URL ? "DATABASE_URL" : "DIRECT_URL";
  const c = normalizeDbUrl(process.env.DATABASE_URL || process.env.DIRECT_URL);
  const t0 = Date.now();
  try {
    const sql = getSql();
    const r = await Promise.race([
      sql`select count(*)::int as n from app.users where email like ${"%@demo.local"}`,
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("o banco não respondeu em 10 s")), 10_000)),
    ]);
    const [d] = await sql`select max(date)::text as d from app.daily_metrics`;
    const erros = await sql`select started_at, summary->>'caminho' as caminho, summary->>'mensagem' as mensagem, summary->>'pilha' as pilha from app.job_runs where job = 'erro' order by started_at desc limit 5`;
    return NextResponse.json({ ok: true, conexao: which, servidor: c.host, porta: c.port, usuarios_demo: r[0].n, dados_ate: d.d, ms: Date.now() - t0, ultimos_erros: erros });
  } catch (e) {
    return NextResponse.json({ ok: false, conexao: which, servidor: c.host, porta: c.port, erro: (e as Error).message, ms: Date.now() - t0 }, { status: 503 });
  }
}
