import { NextResponse } from "next/server";
import { advanceDays } from "@/server/services/advance";

// tempo máximo da função (ver DECISOES: limite do plano gratuito da Vercel)
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Avanço diário (Parte 19.4), chamado pelo cron da Vercel às 06:05 de Fortaleza. Protegido por CRON_SECRET. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const r = await advanceDays({ trigger: "cron" });
    return NextResponse.json({ ok: true, ...r, alerts: r.alerts.length });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
