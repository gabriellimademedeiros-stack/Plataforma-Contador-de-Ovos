/** Cartão "Hoje (parcial, ao vivo)" da ficha do galpão (Parte 16.1). */
import "server-only";
import { getSql } from "@/db/client";
import { addDays, currentProductiveDate, farmInstant } from "@/lib/dates";
import { houseIdFor } from "@/lib/ids";
import { liveToday } from "@/engine/alerts/live";
import { median } from "@/engine/stats";
import { assertHouse, type Scope } from "@/server/permissions";

export async function getLiveToday(scope: Scope, house: string, now = new Date()) {
  assertHouse(scope, house);
  const sql = getSql();
  const day = currentProductiveDate(now);
  const hid = houseIdFor(house);
  const start = farmInstant(day, 6);
  const [[rec], counts, water, temps, prevDeaths, lastMsg] = await Promise.all([
    sql`select birds_start, deaths, feed_kg, water_l from app.daily_records where house_id = ${hid} and date = ${day}`,
    sql`select coalesce(sum(qty), 0)::int as eggs, count(distinct window_start)::int as minutes, min(window_start) as first, max(window_start) as last from app.egg_counts where house_id = ${hid} and date = ${day} and window_minutes = 1`,
    sql`select ts, value from app.sensor_readings where house_id = ${hid} and metric_code = 'nut.agua_litros' and ts >= ${start.toISOString()} order by ts`,
    sql`select max(value)::float as t, max(ts) as last from app.sensor_readings where house_id = ${hid} and metric_code = 'amb.temp_interna' and ts >= ${start.toISOString()}`,
    sql`select deaths from app.daily_records where house_id = ${hid} and date between ${addDays(day, -14)} and ${addDays(day, -1)}`,
    sql`select max(d.last_seen_at) as t from app.devices d join app.device_assignments a on a.device_id = d.id where a.house_id = ${hid} and d.type = 'contador'`,
  ]);
  const c = counts[0];
  const hasData = !!rec || c.minutes > 0 || water.length > 0 || temps[0]?.t != null;
  if (!hasData) return null;
  // água: soma do dia × mesmas horas da média dos 7 dias anteriores
  let waterRef: number | null = null;
  const waterToday = water.length ? water.reduce((a, r) => a + Number(r.value), 0) : null;
  if (water.length) {
    const hours = water.map((r) => Math.floor((new Date(r.ts).getTime() - start.getTime()) / 3_600_000));
    const refs: number[] = [];
    for (let k = 1; k <= 7; k++) {
      const s0 = farmInstant(addDays(day, -k), 6).getTime();
      const rows = await sql`select ts, value from app.sensor_readings where house_id = ${hid} and metric_code = 'nut.agua_litros' and ts >= ${new Date(s0).toISOString()} and ts < ${new Date(s0 + 86_400_000).toISOString()}`;
      const tot = rows.filter((r) => hours.includes(Math.floor((new Date(r.ts).getTime() - s0) / 3_600_000))).reduce((a, r) => a + Number(r.value), 0);
      if (tot > 0) refs.push(tot);
    }
    waterRef = refs.length ? refs.reduce((a, b) => a + b, 0) / refs.length : null;
  }
  const birds = rec ? Number(rec.birds_start) : (await sql`select birds_start - deaths - culls as b from app.daily_records where house_id = ${hid} and date < ${day} order by date desc limit 1`)[0]?.b;
  const v = liveToday({
    eggs: c.minutes > 0 ? Number(c.eggs) : null,
    birds: birds != null ? Number(birds) : null,
    hoursOfCount: c.minutes / 60,
    water: rec?.water_l != null ? Number(rec.water_l) : waterToday,
    waterRef: rec?.water_l != null ? null : waterRef,
    tempMax: temps[0]?.t ?? null,
    deaths: rec ? Number(rec.deaths) : null,
    deathsMedian: median(prevDeaths.map((r) => Number(r.deaths))),
    feedKg: rec?.feed_kg != null ? Number(rec.feed_kg) : null,
  });
  const lastTimes = [c.last, temps[0]?.last, water[water.length - 1]?.ts, lastMsg[0]?.t].filter(Boolean).map((t) => new Date(t).getTime());
  return { day, ...v, countMinutes: Number(c.minutes), lastUpdate: lastTimes.length ? new Date(Math.max(...lastTimes)).toISOString() : null };
}
