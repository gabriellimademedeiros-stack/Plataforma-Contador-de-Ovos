"use server";
/**
 * Ações de servidor do simulador de contador ao vivo (Parte 16.2). O token do dispositivo fica no servidor:
 * o navegador só pede "envie o próximo minuto" e recebe o resultado.
 */
import { headers } from "next/headers";
import { getSql } from "@/db/client";
import { currentProductiveDate, farmLocalParts } from "@/lib/dates";
import { houseIdFor } from "@/lib/ids";
import { EGG_CLASSES, type ClassCounts } from "@/engine/types";
import { getScope } from "@/server/services/context";
import { typicalMinute } from "@/server/services/demo-live";

export interface SentMessage {
  body: Record<string, unknown>;
  status: number;
  duplicate: boolean;
  latencyMs: number;
  recordedMs: number | null;
  error: string | null;
}

async function guard() {
  const scope = await getScope();
  if (!scope.canDemo) throw new Error("Somente a diretoria usa o simulador.");
}

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

async function post(body: Record<string, unknown>): Promise<SentMessage> {
  const t0 = Date.now();
  const r = await fetch(`${await origin()}/api/ingest/contador`, { method: "POST", headers: { "Content-Type": "application/json", "x-device-token": process.env.DEVICE_TOKEN ?? "" }, body: JSON.stringify(body), cache: "no-store" });
  const d = await r.json().catch(() => ({}));
  return { body, status: r.status, duplicate: !!d.duplicate, latencyMs: Date.now() - t0, recordedMs: d.recorded_ms ?? null, error: d.error ?? null };
}

const noisy = (v: number, k: number) => Math.max(0, Math.round(v * (1 + (Math.sin(k * 12.9898) * 43758.5453 % 1) * 0.06)));

/** Envia um minuto de contagem por galpão e pista; `cursor` é o início da janela (avança 1 minuto por envio, sem passar de agora). */
export async function sendTick(houses: string[], cursor: string): Promise<{ sent: SentMessage[]; next: string; waiting: boolean }> {
  await guard();
  const now = Date.now();
  const maxWs = Math.floor(now / 60_000) * 60_000 - 60_000;
  // já alcançou o minuto atual: espera o próximo minuto fechar (não reenvia a mesma janela)
  if (Date.parse(cursor) > maxWs) return { sent: [], next: cursor, waiting: true };
  const ws = new Date(Date.parse(cursor));
  // identificador com a hora local da granja, como no exemplo da Parte 16.3 (…-20261125T0906 para 12:06Z)
  const lp = farmLocalParts(ws);
  const stamp = `${lp.date.replace(/-/g, "")}T${String(lp.hour).padStart(2, "0")}${String(lp.minute).padStart(2, "0")}`;
  const sent: SentMessage[] = [];
  for (const house of houses.filter((h) => /^P00[1-8]$/.test(h))) {
    const typ = await typicalMinute(house);
    for (const lane of [1, 2] as const) {
      const counts = Object.fromEntries(EGG_CLASSES.map((c, i) => [c, noisy(typ[lane][c as keyof ClassCounts], ws.getTime() / 60_000 + i + lane)]));
      sent.push(
        await post({
          message_id: `CNT-000${house.slice(3)}-${lane}-${stamp}`,
          device_code: `CNT-000${house.slice(3)}`,
          house_code: house,
          lane,
          window_start: ws.toISOString(),
          window_minutes: 1,
          model_version: "egg-cls-1.4.2",
          counts,
          mean_confidence: 0.96,
          lens_sharpness: 0.91,
          belt_running_seconds: 60,
        }),
      );
    }
  }
  return { sent, next: new Date(ws.getTime() + 60_000).toISOString(), waiting: false };
}

/** "Enviar mensagem duplicada": reenvia exatamente a última mensagem (mesmo message_id). */
export async function resend(body: Record<string, unknown>): Promise<SentMessage> {
  await guard();
  return post(body);
}

/** Últimas 20 mensagens recebidas, totais do dia por classe e situação dos contadores. */
export async function counterStatus(houses: string[]) {
  await guard();
  const sql = getSql();
  const day = currentProductiveDate();
  const ids = houses.filter((h) => /^P00[1-8]$/.test(h)).map(houseIdFor);
  if (!ids.length) return { last: [], totals: {}, devices: [] };
  const last = await sql`select message_id, max(h.code) as house, max(e.lane) as lane, min(e.window_start) as ws, sum(e.qty)::int as eggs, max(e.quality_flag) as qf
    from app.egg_counts e join app.houses h on h.id = e.house_id where e.house_id in ${sql(ids)} and e.window_minutes = 1 and e.message_id like 'CNT-%' group by message_id order by min(e.window_start) desc, message_id desc limit 20`;
  const tot = await sql`select egg_class, sum(qty)::int as q from app.egg_counts where house_id in ${sql(ids)} and date = ${day} and window_minutes = 1 group by egg_class`;
  const devices = await sql`select d.code, h.code as house, d.last_seen_at,
      (select count(distinct e.window_start)::int from app.egg_counts e where e.house_id = h.id and e.window_minutes = 1 and e.window_start >= now() - interval '10 minutes') as recent
    from app.devices d join app.device_assignments a on a.device_id = d.id join app.houses h on h.id = a.house_id where d.type = 'contador' and h.id in ${sql(ids)} order by d.code`;
  return {
    last: last.map((r) => ({ id: r.message_id as string, house: r.house as string, lane: Number(r.lane), ws: new Date(r.ws).toISOString(), eggs: Number(r.eggs), qf: Number(r.qf) })),
    totals: Object.fromEntries(tot.map((r) => [r.egg_class, Number(r.q)])),
    devices: devices.map((r) => {
      const seen = r.last_seen_at ? new Date(r.last_seen_at).getTime() : null;
      return { code: r.code as string, house: r.house as string, lastSeen: seen ? new Date(seen).toISOString() : null, online: seen != null && Date.now() - seen <= 120_000, completeness10: Math.min(1, Number(r.recent) / 10) };
    }),
  };
}
