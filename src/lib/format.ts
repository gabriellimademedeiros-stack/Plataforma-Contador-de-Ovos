/** Formatação pt-BR (Parte 4.7). Valores nulos aparecem como "—" (não verificável). */
export const EMPTY = "—";
export const EGGS_PER_BOX = 360;
const MINUS = "−";

const nfCache = new Map<string, Intl.NumberFormat>();
function nf(decimals: number, style: "decimal" | "currency" = "decimal"): Intl.NumberFormat {
  const key = `${style}:${decimals}`;
  let f = nfCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat("pt-BR", {
      style,
      currency: style === "currency" ? "BRL" : undefined,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    nfCache.set(key, f);
  }
  return f;
}

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Troca o hífen-menos ASCII pelo sinal de menos tipográfico. */
function withMinus(s: string): string {
  return s.replace(/^-/, MINUS).replace(/−?-/, MINUS);
}

export function fmtNumber(v: number | null | undefined, decimals = 0): string {
  if (!isNum(v)) return EMPTY;
  const r = Number(v.toFixed(decimals));
  return withMinus(nf(decimals).format(Object.is(r, -0) ? 0 : r));
}

export function fmtInt(v: number | null | undefined): string {
  return fmtNumber(v, 0);
}

export function fmtPct(v: number | null | undefined, decimals = 1): string {
  if (!isNum(v)) return EMPTY;
  return `${fmtNumber(v, decimals)}%`;
}

export function fmtBRL(v: number | null | undefined, decimals = 2): string {
  if (!isNum(v)) return EMPTY;
  const r = Number(v.toFixed(decimals));
  return withMinus(nf(decimals, "currency").format(Object.is(r, -0) ? 0 : r)).replace(/ /g, " ");
}

/** Variação em pontos percentuais: "−3,2 p.p." / "+1,0 p.p." */
export function fmtPP(v: number | null | undefined, decimals = 1, signed = true): string {
  if (!isNum(v)) return EMPTY;
  const s = fmtNumber(Math.abs(v), decimals);
  const zero = Number(Math.abs(v).toFixed(decimals)) === 0;
  const sign = !signed || zero ? "" : v < 0 ? MINUS : "+";
  return `${sign}${s} p.p.`;
}

/** Variação relativa com sinal: "+4,2%" */
export function fmtSignedPct(v: number | null | undefined, decimals = 1): string {
  if (!isNum(v)) return EMPTY;
  const zero = Number(Math.abs(v).toFixed(decimals)) === 0;
  const sign = zero ? "" : v < 0 ? MINUS : "+";
  return `${sign}${fmtNumber(Math.abs(v), decimals)}%`;
}

export function fmtSigned(v: number | null | undefined, decimals = 1, unit = ""): string {
  if (!isNum(v)) return EMPTY;
  const zero = Number(Math.abs(v).toFixed(decimals)) === 0;
  const sign = zero ? "" : v < 0 ? MINUS : "+";
  return `${sign}${fmtNumber(Math.abs(v), decimals)}${unit}`;
}

export function boxesFromEggs(eggs: number): number {
  return eggs / EGGS_PER_BOX;
}

/** "1.234.567 ovos (3.429 caixas)" */
export function fmtEggsAndBoxes(eggs: number | null | undefined): string {
  if (!isNum(eggs)) return EMPTY;
  return `${fmtInt(eggs)} ovos (${fmtInt(Math.round(boxesFromEggs(eggs)))} caixas)`;
}

/** "2026-11-24" → "24/11/2026" */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return EMPTY;
  const s = iso.slice(0, 10);
  return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
}

/** "2026-11-24" → "24/11" */
export function fmtDayMonth(iso: string | null | undefined): string {
  if (!iso) return EMPTY;
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/** Instante → "24/11/2026 08:10" no fuso da granja. */
export function fmtDateTime(instant: Date | string | null | undefined): string {
  if (!instant) return EMPTY;
  const d = typeof instant === "string" ? new Date(instant) : instant;
  const f = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Fortaleza",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return f.format(d).replace(",", "");
}

export function fmtTime(instant: Date | string | null | undefined): string {
  if (!instant) return EMPTY;
  const d = typeof instant === "string" ? new Date(instant) : instant;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Fortaleza",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/** "52 semanas (366 dias)" */
export function fmtAge(days: number | null | undefined, short = false): string {
  if (!isNum(days)) return EMPTY;
  const w = Math.floor(days / 7);
  return short ? `${w} sem` : `${w} semanas (${fmtInt(days)} dias)`;
}

/** Tempo relativo curto: "há 3 h", "há 2 dias" */
export function fmtSince(instant: Date | string | null | undefined, now: Date = new Date()): string {
  if (!instant) return EMPTY;
  const d = typeof instant === "string" ? new Date(instant) : instant;
  const min = Math.max(0, Math.round((now.getTime() - d.getTime()) / 60000));
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `há ${h} h`;
  return `há ${Math.round(h / 24)} dias`;
}
