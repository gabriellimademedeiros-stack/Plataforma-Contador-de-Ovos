import "server-only";
import { cache } from "react";
import { getSql } from "@/db/client";

export interface HouseRef {
  id: string;
  code: string;
  name: string;
  capacity: number;
  coolingDelta: number;
  color: string;
  sortOrder: number;
}

export interface FlockRef {
  id: string;
  code: string;
  strainCode: string;
  strainName: string;
  houseId: string;
  houseCode: string;
  hatchDate: string;
  birdsHoused: number;
  plannedCullAgeWeeks: number;
  status: string;
  startDate: string;
  endDate: string | null;
}

const d10 = (v: unknown) => (v == null ? null : typeof v === "string" ? v.slice(0, 10) : (v as Date).toISOString().slice(0, 10));

export const getHouses = cache(async (): Promise<HouseRef[]> => {
  const sql = getSql();
  const rows = await sql`select id, code, name, capacity, cooling_delta_c, color, sort_order from app.houses order by sort_order`;
  return rows.map((h) => ({ id: h.id, code: h.code, name: h.name, capacity: Number(h.capacity), coolingDelta: Number(h.cooling_delta_c), color: h.color, sortOrder: Number(h.sort_order) }));
});

export const getFarm = cache(async () => {
  const sql = getSql();
  const [f] = await sql`select * from app.farms limit 1`;
  return f ? { id: f.id as string, name: f.name as string, city: f.city as string, state: f.state as string, cutoffHour: Number(f.cutoff_hour) } : null;
});

export const getFlocks = cache(async (): Promise<FlockRef[]> => {
  const sql = getSql();
  const rows = await sql`
    select f.id, f.code, s.code as strain_code, s.name as strain_name, h.id as house_id, h.code as house_code, f.hatch_date,
      f.birds_housed, f.planned_cull_age_weeks, f.status, p.start_date, p.end_date
    from app.flocks f join app.strains s on s.id = f.strain_id join app.flock_placements p on p.flock_id = f.id
    join app.houses h on h.id = p.house_id order by p.start_date`;
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    strainCode: r.strain_code,
    strainName: r.strain_name,
    houseId: r.house_id,
    houseCode: r.house_code,
    hatchDate: d10(r.hatch_date)!,
    birdsHoused: Number(r.birds_housed),
    plannedCullAgeWeeks: Number(r.planned_cull_age_weeks),
    status: r.status,
    startDate: d10(r.start_date)!,
    endDate: d10(r.end_date),
  }));
});

/** Data de referência = maior data em daily_metrics ("Dados até …"). */
export const getRefDate = cache(async (): Promise<string> => {
  const sql = getSql();
  const [r] = await sql`select max(date) as d from app.daily_metrics`;
  return d10(r?.d) ?? new Date().toISOString().slice(0, 10);
});

export function currentFlockOf(flocks: FlockRef[], houseCode: string, date: string): FlockRef | undefined {
  return flocks.find((f) => f.houseCode === houseCode && f.startDate <= date && (f.endDate == null || date <= f.endDate));
}
