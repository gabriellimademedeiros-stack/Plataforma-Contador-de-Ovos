/** Tela de dispositivos (Parte 14.19): 8 contadores e 8 gateways. */
import "server-only";
import { getSql } from "@/db/client";
import type { Scope } from "@/server/permissions";
import { getRefDate } from "@/server/repositories/reference";

export interface DeviceRow {
  code: string;
  type: "contador" | "gateway";
  house: string;
  status: "simulado" | "online" | "offline";
  lastMessage: string | null;
  live: boolean;
  model: string | null;
  firmware: string | null;
  confidence: number | null;
  undeterminedYesterday: number | null;
  temperature: number | null;
  completeness10: number | null;
}

/** Temperatura interna fictícia do equipamento: estável por dispositivo (38 a 44 °C). */
const fakeTemp = (code: string) => 38 + ((code.split("").reduce((a, ch) => a + ch.charCodeAt(0), 0) * 7) % 60) / 10;

export async function listDevices(scope: Scope): Promise<DeviceRow[]> {
  const sql = getSql();
  const ref = await getRefDate();
  const houses = [...scope.houseCodes];
  const rows = await sql`select d.code, d.type, d.status, d.last_seen_at, d.model_version, d.firmware, d.confidence_score, h.code as house, h.id as house_id
    from app.devices d join app.device_assignments a on a.device_id = d.id and a.valid_to is null join app.houses h on h.id = a.house_id
    where h.code in ${sql(houses.length ? houses : ["__"])} order by d.type desc, h.code`;
  const und = await sql`select h.code, sum(qty) filter (where egg_class = 'undetermined')::float / nullif(sum(qty), 0) * 100 as p from app.egg_counts e join app.houses h on h.id = e.house_id
    where e.date = ${ref} and e.window_minutes = 1440 group by h.code`;
  const lastSim = await sql`select h.code, max(e.window_start) as ws from app.egg_counts e join app.houses h on h.id = e.house_id where e.window_minutes in (60, 1440) and e.date >= ${ref} group by h.code`;
  const recent = await sql`select h.code, count(distinct e.window_start)::int as n from app.egg_counts e join app.houses h on h.id = e.house_id where e.window_minutes = 1 and e.window_start >= now() - interval '10 minutes' group by h.code`;
  const und$ = new Map(und.map((r) => [r.code, r.p == null ? null : Number(r.p)]));
  const sim$ = new Map(lastSim.map((r) => [r.code, r.ws ? new Date(r.ws).toISOString() : null]));
  const rec$ = new Map(recent.map((r) => [r.code, Number(r.n)]));
  const now = Date.now();
  const counters = new Map<string, DeviceRow>();
  const out: DeviceRow[] = [];
  for (const r of rows.filter((x) => x.type === "contador")) {
    const seen = r.last_seen_at ? new Date(r.last_seen_at).getTime() : null;
    const status: DeviceRow["status"] = seen == null ? "simulado" : now - seen <= 120_000 ? "online" : "offline";
    const row: DeviceRow = {
      code: r.code,
      type: "contador",
      house: r.house,
      status,
      lastMessage: seen ? new Date(seen).toISOString() : (sim$.get(r.house) ?? null),
      live: seen != null,
      model: r.model_version,
      firmware: r.firmware,
      confidence: r.confidence_score == null ? null : Number(r.confidence_score),
      undeterminedYesterday: und$.get(r.house) ?? null,
      temperature: Math.round(fakeTemp(r.code) * 10) / 10,
      completeness10: seen ? Math.min(1, (rec$.get(r.house) ?? 0) / 10) : null,
    };
    counters.set(r.house, row);
    out.push(row);
  }
  for (const r of rows.filter((x) => x.type === "gateway")) {
    const c = counters.get(r.house);
    out.push({ code: r.code, type: "gateway", house: r.house, status: c?.status ?? "simulado", lastMessage: c?.lastMessage ?? null, live: c?.live ?? false, model: null, firmware: r.firmware, confidence: null, undeterminedYesterday: null, temperature: Math.round((fakeTemp(r.code) - 4) * 10) / 10, completeness10: null });
  }
  return out;
}
