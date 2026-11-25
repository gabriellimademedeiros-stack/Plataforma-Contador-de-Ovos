/**
 * Datas de negócio da granja.
 * Convenção: toda data de negócio é uma string ISO "AAAA-MM-DD" já no fuso da granja.
 * Instantes são objetos Date (UTC). Fuso America/Fortaleza (UTC−3, sem horário de verão).
 */
import { TZDate } from "@date-fns/tz";

export const FARM_TZ = "America/Fortaleza";
export const DEFAULT_CUTOFF_HOUR = 6;
export const DEFAULT_WEEK_START_DOW = 0; // domingo

export type ISODate = string;

export interface PhaseBounds {
  inicio: [number, number];
  pico: [number, number];
  postura1: [number, number];
  postura2: [number, number];
}

export const DEFAULT_PHASE_BOUNDS: PhaseBounds = {
  inicio: [17, 25],
  pico: [26, 57],
  postura1: [58, 73],
  postura2: [74, 999],
};

export type Phase = "recria" | "inicio" | "pico" | "postura1" | "postura2";

export const PHASE_LABEL: Record<Phase, string> = {
  recria: "Recria",
  inicio: "Início de postura",
  pico: "Pico",
  postura1: "Postura 1",
  postura2: "Postura 2",
};

const DAY_MS = 86_400_000;

function isoToUtcMs(iso: ISODate): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function utcMsToIso(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function isISODate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(isoToUtcMs(s));
}

export function addDays(iso: ISODate, n: number): ISODate {
  return utcMsToIso(isoToUtcMs(iso) + n * DAY_MS);
}

/** b − a, em dias. */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((isoToUtcMs(b) - isoToUtcMs(a)) / DAY_MS);
}

/** 0 = domingo … 6 = sábado */
export function dayOfWeek(iso: ISODate): number {
  return new Date(isoToUtcMs(iso)).getUTCDay();
}

export function dayOfYear(iso: ISODate): number {
  const y = Number(iso.slice(0, 4));
  return diffDays(`${y}-01-01`, iso) + 1;
}

export function monthOf(iso: ISODate): number {
  return Number(iso.slice(5, 7));
}

export function dateRange(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return a < b ? a : b;
}
export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a > b ? a : b;
}

/** Data e hora locais (fuso da granja) de um instante. */
export function farmLocalParts(instant: Date): { date: ISODate; hour: number; minute: number } {
  const z = new TZDate(instant.getTime(), FARM_TZ);
  const y = z.getFullYear();
  const m = String(z.getMonth() + 1).padStart(2, "0");
  const d = String(z.getDate()).padStart(2, "0");
  return { date: `${y}-${m}-${d}`, hour: z.getHours(), minute: z.getMinutes() };
}

/**
 * Dia produtivo de um instante: tudo entre 06:00 do dia D e 05:59 do dia D+1 pertence a D.
 */
export function productiveDate(instant: Date, cutoffHour = DEFAULT_CUTOFF_HOUR): ISODate {
  const { date, hour } = farmLocalParts(instant);
  return hour < cutoffHour ? addDays(date, -1) : date;
}

/** Instante UTC correspondente a uma data e hora locais da granja. */
export function farmInstant(date: ISODate, hour = 0, minute = 0): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(new TZDate(y, m - 1, d, hour, minute, 0, FARM_TZ).getTime());
}

/** Hoje (data civil) no fuso da granja. */
export function farmToday(now: Date = new Date()): ISODate {
  return farmLocalParts(now).date;
}

/** Ontem no fuso da granja (D_end padrão do simulador). */
export function farmYesterday(now: Date = new Date()): ISODate {
  return addDays(farmToday(now), -1);
}

/** Dia produtivo corrente (em andamento). */
export function currentProductiveDate(now: Date = new Date()): ISODate {
  return productiveDate(now);
}

/** Domingo que inicia a semana da data. */
export function weekStart(iso: ISODate, weekStartDow = DEFAULT_WEEK_START_DOW): ISODate {
  const dow = dayOfWeek(iso);
  const back = (dow - weekStartDow + 7) % 7;
  return addDays(iso, -back);
}

export function weekEnd(ws: ISODate): ISODate {
  return addDays(ws, 6);
}

/** "Semana de 16/11 a 22/11/2026" */
export function weekLabel(ws: ISODate): string {
  const we = weekEnd(ws);
  const a = `${ws.slice(8, 10)}/${ws.slice(5, 7)}`;
  const b = `${we.slice(8, 10)}/${we.slice(5, 7)}/${we.slice(0, 4)}`;
  return `Semana de ${a} a ${b}`;
}

/** Última semana completa (domingo a sábado) até a data de referência (inclusive). */
export function lastCompleteWeekStart(refDate: ISODate): ISODate {
  const ws = weekStart(refDate);
  return weekEnd(ws) <= refDate ? ws : addDays(ws, -7);
}

export function ageDays(date: ISODate, hatchDate: ISODate): number {
  return diffDays(hatchDate, date);
}

export function ageWeek(date: ISODate, hatchDate: ISODate): number {
  return Math.floor(ageDays(date, hatchDate) / 7);
}

/** Idade decimal em semanas (para curvas). */
export function ageWeeksDecimal(date: ISODate, hatchDate: ISODate): number {
  return ageDays(date, hatchDate) / 7;
}

export function phaseForAgeWeek(week: number, bounds: PhaseBounds = DEFAULT_PHASE_BOUNDS): Phase {
  if (week < bounds.inicio[0]) return "recria";
  if (week <= bounds.inicio[1]) return "inicio";
  if (week <= bounds.pico[1]) return "pico";
  if (week <= bounds.postura1[1]) return "postura1";
  return "postura2";
}
