/** Ingestão das mensagens do contador (Parte 16.3). */
import "server-only";
import { z } from "zod";
import { getSql } from "@/db/client";
import { productiveDate } from "@/lib/dates";
import { TENANT_ID } from "@/lib/ids";
import { EGG_CLASSES } from "@/engine/types";
import { recomputeHouseDay } from "./recompute";

const Count = z.number().int().min(0).max(100000);
export const CounterMessage = z.object({
  message_id: z.string().min(5).max(120),
  device_code: z.string().regex(/^CNT-\d{4}$/),
  house_code: z.string().regex(/^P\d{3}$/),
  lane: z.union([z.literal(1), z.literal(2)]),
  window_start: z.string().datetime(),
  window_minutes: z.literal(1),
  model_version: z.string().max(40),
  counts: z.object({ clean: Count, dirty_feces: Count, dirty_blood: Count, cracked: Count, broken: Count, undetermined: Count }),
  mean_confidence: z.number().min(0).max(1),
  lens_sharpness: z.number().min(0).max(1).nullish(),
  belt_running_seconds: z.number().int().min(0).max(60).nullish(),
});
export type CounterMessageT = z.infer<typeof CounterMessage>;

export class IngestError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Último recálculo por galpão: no máximo uma vez a cada 30 s (por instância do servidor). */
const lastRecompute = new Map<string, number>();

export async function ingestCounterMessage(m: CounterMessageT, now = new Date()) {
  const t0 = Date.now();
  const sql = getSql();
  const ws = new Date(m.window_start);
  if (ws.getTime() > now.getTime() + 2 * 60_000) throw new IngestError(400, "Janela no futuro (tolerância de 2 minutos).");
  const [dup] = await sql`select 1 from app.egg_counts where message_id = ${m.message_id} limit 1`;
  if (dup) return { duplicate: true, recorded_ms: Date.now() - t0, recomputed: false };
  const [dev] = await sql`select d.id, h.id as house_id, h.code as house from app.devices d join app.device_assignments a on a.device_id = d.id join app.houses h on h.id = a.house_id
    where d.code = ${m.device_code} and d.type = 'contador' and (a.valid_to is null or a.valid_to >= current_date) limit 1`;
  if (!dev) throw new IngestError(404, `Dispositivo ${m.device_code} não encontrado.`);
  if (dev.house !== m.house_code) throw new IngestError(409, `O dispositivo ${m.device_code} não está atribuído ao ${m.house_code}.`);
  const qf = m.mean_confidence < 0.8 ? 1 : 0;
  const day = productiveDate(ws);
  const rows = EGG_CLASSES.map((c) => ({ tenant_id: TENANT_ID, house_id: dev.house_id, device_id: dev.id, date: day, window_start: ws.toISOString(), window_minutes: 1, lane: m.lane, egg_class: c, qty: m.counts[c], mean_conf: m.mean_confidence, model_version: m.model_version, message_id: m.message_id, quality_flag: qf, source: "ao_vivo" }));
  await sql`insert into app.egg_counts ${sql(rows as never)} on conflict (house_id, window_start, window_minutes, lane, egg_class) do nothing`;
  await sql`update app.devices set last_seen_at = ${now.toISOString()}, status = 'online', model_version = ${m.model_version} where id = ${dev.id}`;
  const recorded = Date.now() - t0;
  let recomputed = false;
  const last = lastRecompute.get(m.house_code) ?? 0;
  if (now.getTime() - last >= 30_000) {
    lastRecompute.set(m.house_code, now.getTime());
    await recomputeHouseDay(m.house_code, day, { now });
    recomputed = true;
  }
  return { duplicate: false, recorded_ms: recorded, recomputed, quality_flag: qf };
}
