/**
 * Regras de tempo real (Parte 16.1), avaliadas só no dia produtivo corrente:
 *  A02 — esteira sem fluxo; A08h — queda de água no dia; A11 com os dados horários do dia.
 * Funções puras: recebem as séries já lidas do banco.
 */
import type { CondResult } from "./conditions";

export interface HourValue {
  /** hora do dia produtivo: 0 = 06h00–06h59, …, 23 = 05h00–05h59 */
  slot: number;
  value: number;
}

/** A08h: água acumulada desde as 06h ≤ ratio × média das mesmas horas nos 7 dias anteriores, com pelo menos min_hours de dados. */
export function evalA08h(today: HourValue[], prevDays: HourValue[][], params: { ratio: number; base_days: number; min_hours: number }): CondResult {
  const slots = today.map((h) => h.slot);
  if (slots.length < params.min_hours) return { hit: null, value: null, reference: null, extra: { hours: slots.length } };
  const cumToday = today.reduce((a, h) => a + h.value, 0);
  const bases = prevDays
    .slice(0, params.base_days)
    .map((day) => {
      const m = new Map(day.map((h) => [h.slot, h.value]));
      if (!slots.every((s) => m.has(s))) return null;
      return slots.reduce((a, s) => a + (m.get(s) ?? 0), 0);
    })
    .filter((x): x is number => x != null);
  if (bases.length < Math.min(3, params.base_days)) return { hit: null, value: cumToday, reference: null, extra: { hours: slots.length } };
  const ref = bases.reduce((a, b) => a + b, 0) / bases.length;
  const ratio = ref > 0 ? cumToday / ref : null;
  return { hit: ratio != null && ratio <= params.ratio, value: cumToday, reference: ref, extra: { ratio, hours: slots.length, baseDays: bases.length } };
}

/** A11 com dados horários do dia: 2 h ou mais acima de 32 °C, ou qualquer hora acima de 35 °C (crítica). */
export function evalA11Hourly(temps: HourValue[], params: { hours_threshold: number; min_hours: number; critical_temp: number }): CondResult {
  if (!temps.length) return { hit: null, value: null, reference: null };
  const tmax = Math.max(...temps.map((t) => t.value));
  const h32 = temps.filter((t) => t.value > params.hours_threshold).length;
  const crit = tmax > params.critical_temp;
  return { hit: h32 >= params.min_hours || crit, value: tmax, reference: params.hours_threshold, critical: crit, extra: { hours32: h32 } };
}

export interface MinuteCount {
  /** início da janela (ISO, UTC) */
  ts: string;
  eggs: number;
}

/**
 * A02: houve mensagens por minuto nas últimas `lookback_min` e nenhum ovo há `no_eggs_min` minutos ou mais,
 * com a hora local entre start_hour e end_hour.
 */
export function evalA02(minutes: MinuteCount[], now: Date, localHour: number, params: { lookback_min: number; no_eggs_min: number; start_hour: number; end_hour: number }): CondResult {
  if (localHour < params.start_hour || localHour >= params.end_hour) return { hit: null, value: null, reference: params.no_eggs_min, extra: { reason: "fora do horário" } };
  const since = now.getTime() - params.lookback_min * 60_000;
  const recent = minutes.filter((m) => Date.parse(m.ts) >= since && Date.parse(m.ts) <= now.getTime() + 60_000);
  if (!recent.length) return { hit: null, value: null, reference: params.no_eggs_min, extra: { reason: "sem mensagens" } };
  const lastMsg = Math.max(...recent.map((m) => Date.parse(m.ts)));
  if (now.getTime() - lastMsg > 3 * 60_000) return { hit: null, value: null, reference: params.no_eggs_min, extra: { reason: "contador sem mensagens recentes" } };
  const withEggs = recent.filter((m) => m.eggs > 0).map((m) => Date.parse(m.ts));
  const lastEgg = withEggs.length ? Math.max(...withEggs) + 60_000 : since;
  const minutesWithoutEggs = Math.floor((now.getTime() - lastEgg) / 60_000);
  // precisa haver mensagens (com zero) cobrindo o período sem ovos — senão é falta de comunicação, não esteira parada
  const zeroMsgs = recent.filter((m) => m.eggs === 0 && Date.parse(m.ts) >= lastEgg - 60_000).length;
  const hit = minutesWithoutEggs >= params.no_eggs_min && zeroMsgs >= Math.floor(params.no_eggs_min * 0.8);
  return { hit, value: minutesWithoutEggs, reference: params.no_eggs_min, extra: { minutesWithoutEggs, messages: recent.length } };
}

export interface LiveTodayInput {
  eggs: number | null;
  birds: number | null;
  hoursOfCount: number;
  water: number | null;
  waterRef: number | null;
  tempMax: number | null;
  deaths: number | null;
  deathsMedian: number | null;
  feedKg: number | null;
}

/** Cartão "Hoje (parcial, ao vivo)": números do dia em andamento, sem projetar o dia inteiro. */
export function liveToday(i: LiveTodayInput) {
  const posturePartial = i.eggs != null && i.birds ? (i.eggs / i.birds) * 100 : null;
  return {
    eggs: i.eggs,
    boxes: i.eggs != null ? i.eggs / 360 : null,
    posturePartial,
    hoursOfCount: i.hoursOfCount,
    water: i.water,
    waterRatio: i.water != null && i.waterRef ? i.water / i.waterRef : null,
    tempMax: i.tempMax,
    deaths: i.deaths,
    deathsVsMedian: i.deaths != null && i.deathsMedian ? i.deaths / i.deathsMedian : null,
    feedPerBird: i.feedKg != null && i.birds ? (i.feedKg * 1000) / i.birds : null,
  };
}
