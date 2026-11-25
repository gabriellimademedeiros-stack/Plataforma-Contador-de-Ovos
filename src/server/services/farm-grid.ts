import "server-only";
import { getSql } from "@/db/client";
import { addDays, ageDays, phaseForAgeWeek, PHASE_LABEL } from "@/lib/dates";
import type { StatusColor } from "@/lib/colors";
import { statusFor, targetFor } from "@/engine/standards/targets";
import type { Scope } from "@/server/permissions";
import { currentFlockOf, getFlocks, getHouses, getRefDate } from "@/server/repositories/reference";
import { getTargets } from "@/server/repositories/config";
import { readDaily, windowAggregate } from "./metrics-query";

export interface HouseCardData {
  code: string;
  name: string;
  color: string;
  flock: string | null;
  strain: string | null;
  ageDays: number | null;
  phase: string | null;
  birdsPresent: number | null;
  posture: number | null;
  postureDev: number | null;
  postureStatus: StatusColor;
  mortWeek: number | null;
  mortStatus: StatusColor;
  damages: number | null;
  damagesStatus: StatusColor;
  openAlerts: number;
  counterStatus: "online" | "offline" | "simulado";
  emptyUntil: string | null;
}

export async function getFarmGrid(scope: Scope): Promise<{ refDate: string; houses: HouseCardData[] }> {
  const refDate = await getRefDate();
  const [houses, flocks, targets] = await Promise.all([getHouses(), getFlocks(), getTargets()]);
  const rows = await readDaily(scope, { metrics: ["prod.postura", "prod.desvio_interno", "mort.diaria", "qual.avarias", "qual.trincados", "mort.viabilidade"], from: addDays(refDate, -6), to: refDate });
  const sql = getSql();
  const alertCounts = await sql`select h.code, count(*)::int as n from app.alerts a join app.houses h on h.id = a.house_id
    where a.status in ('aberto','reconhecido','em_investigacao') and a.rule_code not in ('A22','P01') group by h.code`;
  const counters = await sql`select h.code, d.status from app.devices d join app.device_assignments a on a.device_id = d.id and a.valid_to is null
    join app.houses h on h.id = a.house_id where d.type = 'contador'`;
  const birds = await sql`select h.code, d.birds_start - d.deaths - d.culls as present from app.daily_records d join app.houses h on h.id = d.house_id where d.date = ${refDate}`;
  const out: HouseCardData[] = [];
  for (const h of houses.filter((x) => scope.houseCodes.has(x.code))) {
    const f = currentFlockOf(flocks, h.code, refDate);
    const nextFlock = flocks.find((x) => x.houseCode === h.code && x.startDate > refDate);
    const day = (m: string) => windowAggregate(rows, m, refDate, refDate, [h.code]).byHouse.get(h.code)?.value ?? null;
    const wk = (m: string) => windowAggregate(rows, m, addDays(refDate, -6), refDate, [h.code]).byHouse.get(h.code)?.value ?? null;
    const aDays = f ? ageDays(refDate, f.hatchDate) : null;
    const dev = day("prod.desvio_interno");
    const mort = wk("mort.diaria");
    const dmg = day("qual.avarias");
    out.push({
      code: h.code,
      name: h.name,
      color: h.color,
      flock: f?.code ?? null,
      strain: f?.strainName ?? null,
      ageDays: aDays,
      phase: aDays != null ? PHASE_LABEL[phaseForAgeWeek(Math.floor(aDays / 7))] : null,
      birdsPresent: Number(birds.find((b) => b.code === h.code)?.present ?? NaN) || null,
      posture: day("prod.postura"),
      postureDev: dev,
      postureStatus: statusFor(dev, targetFor(targets, "prod.desvio_interno")),
      mortWeek: mort,
      mortStatus: statusFor(mort, targetFor(targets, "mort.diaria")),
      damages: dmg,
      damagesStatus: statusFor(day("qual.trincados"), targetFor(targets, "qual.trincados")),
      openAlerts: alertCounts.find((a) => a.code === h.code)?.n ?? 0,
      counterStatus: (counters.find((c) => c.code === h.code)?.status as HouseCardData["counterStatus"]) ?? "simulado",
      emptyUntil: f ? null : (nextFlock?.startDate ?? null),
    });
  }
  return { refDate, houses: out };
}
