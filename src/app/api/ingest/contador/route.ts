import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { CounterMessage, IngestError, ingestCounterMessage } from "@/server/services/ingest";

export const maxDuration = 30;

/** Mensagens do contador (formato da Parte 16.3), protegidas pelo cabeçalho x-device-token. */
export async function POST(req: Request) {
  const token = process.env.DEVICE_TOKEN;
  if (!token || req.headers.get("x-device-token") !== token) return NextResponse.json({ error: "Token do dispositivo inválido." }, { status: 401 });
  try {
    const m = CounterMessage.parse(await req.json());
    const r = await ingestCounterMessage(m);
    return NextResponse.json({ ok: true, message_id: m.message_id, ...r });
  } catch (e) {
    if (e instanceof ZodError) return NextResponse.json({ error: `Mensagem inválida: ${e.issues[0]?.path.join(".")} — ${e.issues[0]?.message}` }, { status: 400 });
    if (e instanceof IngestError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(e);
    return NextResponse.json({ error: "Erro interno ao gravar a mensagem." }, { status: 500 });
  }
}
