/** Cenários ao vivo do painel de demonstração (Parte 16.1). Tudo gravado com source = 'ao_vivo'. */
import "server-only";
import { getSql } from "@/db/client";
import { addDays, currentProductiveDate, farmInstant, farmLocalParts } from "@/lib/dates";
import { TENANT_ID, houseIdFor } from "@/lib/ids";
import { EGG_CLASSES, emptyCounts, type ClassCounts } from "@/engine/types";
import { ApiError } from "@/server/api";
import { recomputeHouseDay, type RecomputeResult } from "./recompute";

const HOUR = 3_600_000;

/** Hora do dia produtivo agora (slot 0 = 06h). */
function currentSlot(now: Date, day: string) {
  return Math.floor((now.getTime() - farmInstant(day, 6).getTime()) / HOUR);
}

/** Média dos 7 dias anteriores, por hora do dia produtivo, de uma métrica de sensor do galpão. */
async function baseBySlot(houseId: string, metric: string, day: string): Promise<Map<number, number>> {
  const sql = getSql();
  const a = farmInstant(addDays(day, -7), 6).toISOString();
  const b = farmInstant(day, 6).toISOString();
  const rows = await sql`select ts, value from app.sensor_readings where house_id = ${houseId} and metric_code = ${metric} and ts >= ${a} and ts < ${b}`;
  const acc = new Map<number, number[]>();
  for (const r of rows) {
    const slot = Math.floor(((new Date(r.ts).getTime() - Date.parse(a)) % (24 * HOUR)) / HOUR);
    acc.set(slot, [...(acc.get(slot) ?? []), Number(r.value)]);
  }
  return new Map([...acc.entries()].map(([s, v]) => [s, v.reduce((x, y) => x + y, 0) / v.length]));
}

/** Contagem típica de 1 minuto às 08h do galpão, por pista (média das horas 08h–09h dos últimos 7 dias ÷ 60). */
export async function typicalMinute(house: string): Promise<Record<1 | 2, ClassCounts>> {
  const sql = getSql();
  const hid = houseIdFor(house);
  const rows = await sql`select lane, egg_class, avg(qty)::float as q from app.egg_counts
    where house_id = ${hid} and window_minutes = 60 and extract(hour from window_start at time zone 'America/Fortaleza') = 8
      and date >= (select max(date) from app.egg_counts where house_id = ${hid} and window_minutes = 60) - 6 group by lane, egg_class`;
  const out: Record<1 | 2, ClassCounts> = { 1: emptyCounts(), 2: emptyCounts() };
  for (const r of rows) out[Number(r.lane) as 1 | 2][r.egg_class as keyof ClassCounts] = Math.round(Number(r.q) / 60);
  if (out[1].clean === 0) for (const l of [1, 2] as const) out[l] = { ...emptyCounts(), clean: 380, dirty_feces: 6, dirty_blood: 1, cracked: 7, broken: 2, undetermined: 3 };
  return out;
}

export type LiveScenario = "bebedouro" | "temperatura" | "esteira";

export async function runLiveScenario(kind: LiveScenario, house: string, now = new Date()): Promise<{ message: string; recompute: RecomputeResult }> {
  const sql = getSql();
  const day = currentProductiveDate(now);
  const hid = houseIdFor(house);
  const slot = currentSlot(now, day);
  if (kind === "bebedouro") {
    // água normal na primeira hora do dia produtivo (06h–07h) e 40% abaixo do normal daí até agora
    if (slot < 2) throw new ApiError(400, "A regra A08h precisa de pelo menos 3 horas de dados do dia: rode este cenário a partir das 08h (horário da granja).");
    const base = await baseBySlot(hid, "nut.agua_litros", day);
    await sql`delete from app.sensor_readings where house_id = ${hid} and metric_code = 'nut.agua_litros' and source = 'ao_vivo' and ts >= ${farmInstant(day, 6).toISOString()}`;
    const rows = [];
    for (let s = 0; s <= slot; s++) {
      const v = base.get(s % 24) ?? 1000;
      rows.push({ tenant_id: TENANT_ID, house_id: hid, ts: new Date(farmInstant(day, 6).getTime() + s * HOUR).toISOString(), metric_code: "nut.agua_litros", value: Math.round((s === 0 ? v : v * 0.6) * 10) / 10, quality_flag: 0, source: "ao_vivo" });
    }
    await sql`insert into app.sensor_readings ${sql(rows as never)}`;
    const recompute = await recomputeHouseDay(house, day, { now });
    return { message: `Gravadas ${rows.length} leituras horárias de água do ${house} (normal até 07h, depois 40% abaixo).`, recompute };
  }
  if (kind === "temperatura") {
    await sql`delete from app.sensor_readings where house_id = ${hid} and metric_code = 'amb.temp_interna' and source = 'ao_vivo' and ts >= ${farmInstant(day, 6).toISOString()}`;
    const temps = [33.2, 34.1, 34.8];
    const rows = temps.map((t, k) => ({ tenant_id: TENANT_ID, house_id: hid, ts: new Date(farmInstant(day, 6).getTime() + Math.max(0, slot - 2 + k) * HOUR).toISOString(), metric_code: "amb.temp_interna", value: t, quality_flag: 0, source: "ao_vivo" }));
    await sql`insert into app.sensor_readings ${sql(rows as never)}`;
    const recompute = await recomputeHouseDay(house, day, { now });
    return { message: `Gravada temperatura interna de 33 a 35 °C no ${house} nas últimas 3 horas.`, recompute };
  }
  // esteira parada: 60 minutos normais e depois zero nos últimos 25 minutos, nas duas pistas
  const typ = await typicalMinute(house);
  const end = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
  await sql`delete from app.egg_counts where house_id = ${hid} and window_minutes = 1 and source = 'ao_vivo' and window_start >= ${new Date(end.getTime() - 90 * 60_000).toISOString()}`;
  const rows = [];
  for (let k = 85; k >= 1; k--) {
    const ws = new Date(end.getTime() - k * 60_000);
    const zero = k <= 25;
    for (const lane of [1, 2] as const) {
      for (const c of EGG_CLASSES) rows.push({ tenant_id: TENANT_ID, house_id: hid, device_id: null, date: day, window_start: ws.toISOString(), window_minutes: 1, lane, egg_class: c, qty: zero ? 0 : typ[lane][c], mean_conf: 0.96, model_version: "egg-cls-1.4.2", message_id: `DEMO-${house}-${lane}-${ws.toISOString()}`, quality_flag: 0, source: "ao_vivo" });
    }
  }
  for (let i = 0; i < rows.length; i += 2000) await sql`insert into app.egg_counts ${sql(rows.slice(i, i + 2000) as never)} on conflict do nothing`;
  const recompute = await recomputeHouseDay(house, day, { now });
  const { hour } = farmLocalParts(now);
  const note = hour < 6 || hour >= 16 ? ` Atenção: a regra A02 só é avaliada entre 06h e 16h (agora são ${hour}h no horário da granja); o alerta aparece se o cenário for rodado nesse horário.` : "";
  return { message: `Gravadas mensagens por minuto do contador do ${house}: 60 minutos normais e os últimos 25 minutos sem ovos.${note}`, recompute };
}

/** Apaga tudo com origem ao vivo (dados, alertas e o que eles geraram) e os apontamentos de hoje do campo; recalcula o dia. */
export async function clearLive(now = new Date()) {
  const sql = getSql();
  const day = currentProductiveDate(now);
  const alerts = await sql`select id from app.alerts where source = 'ao_vivo'`;
  const ids = alerts.map((a) => a.id as string);
  const counts: Record<string, number> = {};
  await sql.begin(async (tx) => {
    if (ids.length) {
      const evs = await tx`select event_id from app.event_links l join app.events e on e.id = l.event_id where l.alert_id in ${tx(ids)} and e.type_code = 'detectado.nao_explicado'`;
      const evIds = evs.map((e) => e.event_id as string);
      await tx`delete from app.notifications where alert_id in ${tx(ids)}`;
      await tx`delete from app.anomaly_questions where alert_id in ${tx(ids)}`;
      await tx`delete from app.event_links where alert_id in ${tx(ids)}`;
      if (evIds.length) {
        await tx`delete from app.event_certainty_history where event_id in ${tx(evIds)}`;
        await tx`delete from app.event_scopes where event_id in ${tx(evIds)}`;
        await tx`delete from app.events where id in ${tx(evIds)}`;
      }
      counts.alertas = (await tx`delete from app.alerts where id in ${tx(ids)} returning id`).length;
    }
    counts.sensores = (await tx`delete from app.sensor_readings where source = 'ao_vivo' returning id`).length;
    counts.contagens = (await tx`delete from app.egg_counts where source = 'ao_vivo' returning id`).length;
    counts.apontamentos = (await tx`delete from app.daily_records where source = 'campo' and date >= ${day} returning id`).length;
    await tx`update app.devices set status = 'simulado', last_seen_at = null where type = 'contador'`;
  });
  const r = await recomputeHouseDay("P001", day, { now });
  return { counts, ms: r.ms };
}
