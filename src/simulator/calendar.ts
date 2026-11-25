import { addDays, farmYesterday, isISODate } from "@/lib/dates";
import { HISTORY_DAYS, SIM_DEFAULT_SEED } from "./config";

export interface SimCalendar {
  seed: number;
  dEnd: string;
  dStart: string;
}

/** D_end = SIM_END_DATE ou ontem no fuso America/Fortaleza; D_start = D_end − 1095 dias. */
export function resolveCalendar(
  env: Record<string, string | undefined> = process.env,
  now = new Date(),
): SimCalendar {
  const seed = env.SIM_SEED ? Number(env.SIM_SEED) : SIM_DEFAULT_SEED;
  if (!Number.isFinite(seed)) throw new Error("SIM_SEED inválida");
  const raw = (env.SIM_END_DATE ?? "").trim();
  if (raw && !isISODate(raw)) throw new Error("SIM_END_DATE deve estar no formato AAAA-MM-DD");
  const dEnd = raw || farmYesterday(now);
  return { seed, dEnd, dStart: addDays(dEnd, -HISTORY_DAYS) };
}

/** "D−20" → data absoluta. */
export function rel(dEnd: string, offset: number): string {
  return addDays(dEnd, offset);
}
