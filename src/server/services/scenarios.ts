import "server-only";
import { getSql } from "@/db/client";
import { addDays } from "@/lib/dates";
import { buildFlocks } from "@/simulator/flocks";
import { RngFactory } from "@/simulator/prng";
import { scenarioCatalog, scenarioDates, type ScenarioInfo } from "@/simulator/scenarios";
import type { Flock } from "@/engine/types";

export async function getSimulationState(): Promise<{ seed: number; dStart: string; anchorEnd: string; lastDay: string } | null> {
  const sql = getSql();
  const [r] = await sql`select value from app.system_state where key = 'simulation'`;
  return (r?.value as never) ?? null;
}

/** Catálogo de cenários com datas absolutas (âncora do último reset). */
export async function getScenarios(): Promise<ScenarioInfo[]> {
  const st = await getSimulationState();
  if (!st) return [];
  const flocks = buildFlocks(new RngFactory(st.seed), st.anchorEnd, st.dStart);
  const byHouse = new Map<string, Flock[]>();
  for (const f of flocks) {
    let a = byHouse.get(f.houseCode);
    if (!a) byHouse.set(f.houseCode, (a = []));
    a.push(f);
  }
  const dates = scenarioDates({ dEnd: st.anchorEnd, flocksByHouse: byHouse });
  const active = (d: string) => [...byHouse.entries()].filter(([, fs]) => fs.some((f) => f.startDate <= d && (f.endDate == null || d <= f.endDate))).map(([h]) => h).sort();
  return scenarioCatalog(st.anchorEnd, dates, active);
}

export interface DetectionRow {
  code: string;
  name: string;
  houses: string[];
  start: string;
  end: string;
  expected: string[];
  found: Array<{ rule: string; house: string | null; openedOn: string; id: string }>;
  detected: boolean;
  label: string;
}

/** Tabela "cenário → detectado?" a partir dos alertas gravados. */
export async function scenarioDetection(): Promise<DetectionRow[]> {
  const sc = await getScenarios();
  const sql = getSql();
  const alerts = await sql`select a.id, a.rule_code, h.code as house, a.first_deviation_on, a.opened_on from app.alerts a left join app.houses h on h.id = a.house_id`;
  const d10 = (v: unknown) => (typeof v === "string" ? v.slice(0, 10) : (v as Date).toISOString().slice(0, 10));
  return sc.map((s) => {
    const found = alerts
      .filter((a) => (a.house == null || s.houses.includes(a.house)) && d10(a.first_deviation_on) >= addDays(s.start, -2) && d10(a.first_deviation_on) <= addDays(s.end, 7))
      .filter((a) => s.expectedRules.length === 0 || s.expectedRules.includes(a.rule_code) || s.code === "S7")
      .map((a) => ({ rule: a.rule_code as string, house: a.house as string | null, openedOn: d10(a.opened_on), id: a.id as string }));
    const s7 = s.code === "S7";
    const s7Found = s7 ? alerts.filter((a) => a.house === "P002" && ["A03", "A04", "A05", "A08", "A09"].includes(a.rule_code) && d10(a.first_deviation_on) >= s.start && d10(a.first_deviation_on) <= addDays(s.start, 10)) : [];
    const detected = s7 ? s7Found.length === 0 : found.length > 0;
    return {
      code: s.code,
      name: s.name,
      houses: s.houses,
      start: s.start,
      end: s.end,
      expected: s.expectedRules,
      found: s7 ? s7Found.map((a) => ({ rule: a.rule_code, house: a.house, openedOn: d10(a.opened_on), id: a.id })) : found,
      detected,
      label: s7 ? (detected ? "sem alerta (correto)" : "alerta indevido") : detected ? "detectado" : "NÃO detectado",
    };
  });
}
