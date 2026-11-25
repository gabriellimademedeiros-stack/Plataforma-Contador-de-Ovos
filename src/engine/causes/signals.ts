/**
 * Sinais do motor de causas (Parte 11.2). Cada sinal devolve presente, ausente ou não verificável, com a evidência em texto.
 * Janelas: a = primeiro dia do desvio; d = dia da avaliação; base = a−10 … a−3. Só dados e eventos existentes até d.
 */
import { addDays, ageWeeksDecimal, diffDays, productiveDate } from "@/lib/dates";
import { mean, median, slope } from "@/engine/stats";
import type { MetricStore } from "@/engine/metrics/store";
import type { StrainStandards } from "@/engine/standards/strain";
import type { EventRecord, FeedBatch, Flock, LabSample } from "@/engine/types";
import type { AnomalyType } from "@/engine/alerts/rules";
import type { SignalCode } from "./knowledge-base";

export type SignalState = "presente" | "ausente" | "nao_verificavel";

export interface Signal {
  code: SignalCode;
  state: SignalState;
  text: string;
}

export interface CauseContext {
  store: MetricStore;
  flocks: Map<string, Flock>;
  strainStd: StrainStandards;
  events: EventRecord[];
  lab: Map<string, LabSample[]>;
  feedBatches: FeedBatch[];
}

export interface AnomalyRef {
  house: string;
  anomalyType: AnomalyType;
  a: string;
  d: string;
  /** eventos registrados até este dia contam como conhecidos (padrão: d) */
  knownUntil?: string;
}

const nf = (v: number | null | undefined, dec = 1) => (v == null || !Number.isFinite(v) ? "—" : new Intl.NumberFormat("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(v));
const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** Métrica e direção ligadas a cada tipo de anomalia. */
export const ANOMALY_METRIC: Partial<Record<AnomalyType, { metric: string; dir: "down" | "up"; lane?: [string, string] }>> = {
  postura_queda: { metric: "prod.postura", dir: "down" },
  mortalidade_alta: { metric: "mort.diaria", dir: "up" },
  agua_queda: { metric: "nut.agua", dir: "down" },
  racao_queda: { metric: "nut.racao", dir: "down" },
  temperatura_alta: { metric: "amb.temp_max", dir: "up" },
  trincados_alta: { metric: "qual.trincados", dir: "up", lane: ["qual.trincados_pista1", "qual.trincados_pista2"] },
  sujos_fezes_alta: { metric: "qual.sujos_fezes", dir: "up", lane: ["qual.sujos_fezes_pista1", "qual.sujos_fezes_pista2"] },
  sujos_sangue_alta: { metric: "qual.sujos_sangue", dir: "up", lane: ["qual.sujos_sangue_pista1", "qual.sujos_sangue_pista2"] },
};

function vals(s: MetricStore, house: string, metric: string, from: string, to: string): Array<{ d: string; v: number }> {
  const out: Array<{ d: string; v: number }> = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const v = s.getValid(house, metric, d);
    if (v != null) out.push({ d, v });
  }
  return out;
}

function baseOf(s: MetricStore, house: string, metric: string, a: string): number | null {
  return mean(vals(s, house, metric, addDays(a, -10), addDays(a, -3)).map((x) => x.v));
}

/**
 * Fração do limite da regra que um galpão atinge num dia (≥ 0,5 = "mostra o desvio" para MULTI_GALPOES e afins).
 */
export function deviationScore(s: MetricStore, house: string, type: AnomalyType, d: string, a: string): number | null {
  const m = ANOMALY_METRIC[type];
  if (!m) return null;
  const x = s.getValid(house, m.metric, d);
  if (x == null) return null;
  switch (type) {
    case "postura_queda": {
      const b = baseOf(s, house, m.metric, a);
      return b == null ? null : (b - x) / 3.0;
    }
    case "agua_queda": {
      const b = baseOf(s, house, m.metric, a);
      return b ? (1 - x / b) / 0.1 : null;
    }
    case "racao_queda": {
      const b = baseOf(s, house, m.metric, a);
      return b ? (1 - x / b) / 0.07 : null;
    }
    case "temperatura_alta": {
      const h = s.get(house, "amb.horas_32", d);
      return h == null ? null : h / 2;
    }
    case "mortalidade_alta": {
      const md = median(vals(s, house, m.metric, addDays(a, -10), addDays(a, -3)).map((y) => y.v));
      return md ? (x / md - 1) / 2 : null;
    }
    default: {
      const md = median(vals(s, house, m.metric, addDays(a, -10), addDays(a, -3)).map((y) => y.v));
      if (!md) return null;
      const [rf, add] = type === "trincados_alta" ? [0.4, 0.5] : type === "sujos_fezes_alta" ? [0.4, 0.4] : [1.0, 0.2];
      return Math.min((x / md - 1) / rf, (x - md) / add);
    }
  }
}

function maxScore(s: MetricStore, house: string, type: AnomalyType, from: string, to: string, a: string): number | null {
  let best: number | null = null;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const v = deviationScore(s, house, type, d, a);
    if (v != null && (best == null || v > best)) best = v;
  }
  return best;
}

function eventsUntil(ctx: CauseContext, house: string, d: string) {
  return ctx.events.filter((e) => e.houses.includes(house) && e.certainty !== "descartado" && productiveDate(new Date(e.createdAt)) <= d);
}

export function computeSignals(ctx: CauseContext, ref: AnomalyRef): Record<SignalCode, Signal> {
  const { store: s } = ctx;
  const { house, a, d, anomalyType: type } = ref;
  const out = {} as Record<SignalCode, Signal>;
  const set = (code: SignalCode, state: SignalState, text: string) => (out[code] = { code, state, text });
  const bFrom = addDays(a, -10);
  const bTo = addDays(a, -3);
  const active = s.houses.filter((h) => h !== house && s.flockAt(h, a) != null);
  const flockCode = s.flockAt(house, a);
  const flock = flockCode ? ctx.flocks.get(flockCode) : undefined;
  const ageW = s.ageWeekAt(house, a);

  // Temperatura
  const temps = vals(s, house, "amb.temp_max", addDays(a, -3), d);
  const hotDays = temps.filter((t) => t.v >= 32 || (s.get(house, "amb.horas_32", t.d) ?? 0) >= 2);
  if (!temps.length) set("TEMP_ALTA", "nao_verificavel", "sem leitura de temperatura no período");
  else if (hotDays.length) {
    const mx = temps.reduce((p, c) => (c.v > p.v ? c : p));
    set("TEMP_ALTA", "presente", `temperatura interna máxima de ${nf(mx.v)} °C em ${dm(mx.d)} (${hotDays.length} dia(s) com 32 °C ou mais)`);
  } else set("TEMP_ALTA", "ausente", `temperatura interna máxima até ${nf(Math.max(...temps.map((t) => t.v)))} °C, abaixo de 32 °C`);
  if (out.TEMP_ALTA.state === "presente") set("CALOR_ANTES", hotDays[0].d <= a ? "presente" : "ausente", hotDays[0].d <= a ? `o calor começou em ${dm(hotDays[0].d)}, antes ou junto do desvio (${dm(a)})` : `o calor só começou em ${dm(hotDays[0].d)}, depois do desvio`);
  else set("CALOR_ANTES", out.TEMP_ALTA.state === "ausente" ? "ausente" : "nao_verificavel", "sem calor antes do desvio");

  // Ração e água
  const feedBase = baseOf(s, house, "nut.racao", a);
  const feedNow = mean(vals(s, house, "nut.racao", addDays(a, -1), d).map((x) => x.v));
  if (feedBase == null || feedNow == null) set("RACAO_QUEDA", "nao_verificavel", "sem dado de ração");
  else set("RACAO_QUEDA", feedNow <= 0.95 * feedBase ? "presente" : "ausente", `ração ${nf((feedNow / feedBase - 1) * 100, 0)}% contra a base (${nf(feedNow)} × ${nf(feedBase)} g/ave/dia)`);
  const wBase = baseOf(s, house, "nut.agua", a);
  const wWin = vals(s, house, "nut.agua", addDays(a, -3), d);
  if (wBase == null || !wWin.length) {
    for (const c of ["AGUA_QUEDA", "AGUA_QUEDA_BRUSCA", "AGUA_ANTECEDE", "AGUA_ALTA", "AGUA_ALTA_SEM_CALOR"] as SignalCode[]) set(c, "nao_verificavel", "sem dado de água");
  } else {
    const wMin = wWin.reduce((p, c) => (c.v < p.v ? c : p));
    set("AGUA_QUEDA", wMin.v <= 0.93 * wBase ? "presente" : "ausente", `menor consumo de água ${nf((wMin.v / wBase - 1) * 100, 0)}% contra a base em ${dm(wMin.d)}`);
    set("AGUA_QUEDA_BRUSCA", wMin.v <= 0.8 * wBase ? "presente" : "ausente", wMin.v <= 0.8 * wBase ? `água caiu ${nf((1 - wMin.v / wBase) * 100, 0)}% em ${dm(wMin.d)} (queda brusca)` : `sem queda brusca de água (mínimo ${nf((wMin.v / wBase - 1) * 100, 0)}%)`);
    if (type === "postura_queda") {
      const pre = vals(s, house, "nut.agua", addDays(a, -5), addDays(a, -1)).find((x) => x.v <= 0.95 * wBase);
      set("AGUA_ANTECEDE", pre ? "presente" : "ausente", pre ? `água ${nf((pre.v / wBase - 1) * 100, 0)}% em ${dm(pre.d)}, ${diffDays(pre.d, a)} dia(s) antes da queda de postura` : "a água não caiu antes da postura");
    } else set("AGUA_ANTECEDE", "nao_verificavel", "só se aplica a quedas de postura");
    const wHigh = mean(vals(s, house, "nut.agua", addDays(a, -2), d).map((x) => x.v));
    const high = wHigh != null && wHigh >= 1.07 * wBase;
    set("AGUA_ALTA", high ? "presente" : "ausente", `água média ${nf(((wHigh ?? wBase) / wBase - 1) * 100, 0)}% contra a base`);
    set("AGUA_ALTA_SEM_CALOR", high && out.TEMP_ALTA.state !== "presente" ? "presente" : "ausente", high && out.TEMP_ALTA.state !== "presente" ? `água ${nf((wHigh! / wBase - 1) * 100, 0)}% acima da base sem calor` : high ? "água alta, mas com calor" : "água sem aumento");
  }

  // Outros galpões
  const m = ANOMALY_METRIC[type];
  if (m && active.length) {
    const winTo = addDays(a, 2) < d ? addDays(a, 2) : d;
    const scores = active.map((h) => ({ h, v: maxScore(s, h, type, addDays(a, -2), winTo, a) })).filter((x) => x.v != null) as Array<{ h: string; v: number }>;
    const showing = scores.filter((x) => x.v >= 0.5);
    const mine = maxScore(s, house, type, addDays(a, -2), winTo, a);
    const multi = scores.length > 0 && showing.length >= 0.5 * scores.length;
    set("MULTI_GALPOES", multi ? "presente" : "ausente", multi ? `${showing.length} de ${scores.length} outros galpões mostram o mesmo desvio (${showing.map((x) => x.h).join(", ")})` : `só ${showing.length} de ${scores.length} outros galpões mostram o mesmo desvio`);
    set("SO_ESTE_GALPAO", showing.length <= 1 ? "presente" : "ausente", showing.length <= 1 ? `só este galpão${showing.length === 1 ? ` (e o ${showing[0].h})` : ""} mostra o desvio` : `${showing.length} outros galpões também mostram o desvio`);
    const medOthers = median(scores.map((x) => x.v));
    const worse = multi && mine != null && medOthers != null && medOthers > 0 && mine >= 1.5 * medOthers;
    set("PIOR_QUE_VIZINHOS", worse ? "presente" : "ausente", worse ? `o desvio do ${house} é ${nf(mine! / medOthers!, 1)} × o desvio mediano dos outros galpões` : multi ? "desvio parecido com o dos vizinhos" : "os vizinhos não mostram o desvio");
  } else for (const c of ["MULTI_GALPOES", "SO_ESTE_GALPAO", "PIOR_QUE_VIZINHOS"] as SignalCode[]) set(c, "nao_verificavel", "sem outros galpões comparáveis");

  // Resfriamento
  const cool = mean(vals(s, house, "amb.delta_resfriamento", addDays(a, -3), d).map((x) => x.v));
  const farmCool = median(s.houses.filter((h) => s.flockAt(h, a)).map((h) => mean(vals(s, h, "amb.delta_resfriamento", addDays(a, -3), d).map((x) => x.v))));
  if (cool == null || farmCool == null) set("RESFRIAMENTO_FRACO", "nao_verificavel", "sem dado de resfriamento");
  else set("RESFRIAMENTO_FRACO", cool <= farmCool - 1.0 ? "presente" : "ausente", `diferença de resfriamento de ${nf(cool)} °C contra ${nf(farmCool)} °C da mediana da granja`);

  // Pistas
  if (m?.lane) {
    const days: string[] = [];
    let maxR = 0;
    let worstLane = 0;
    for (let x = a; x <= d; x = addDays(x, 1)) {
      const p1 = s.getValid(house, m.lane[0], x);
      const p2 = s.getValid(house, m.lane[1], x);
      if (p1 == null || p2 == null || Math.min(p1, p2) <= 0) continue;
      const r = Math.max(p1, p2) / Math.min(p1, p2);
      if (r >= 2) days.push(x);
      if (r > maxR) {
        maxR = r;
        worstLane = p2 > p1 ? 2 : 1;
      }
    }
    set("UMA_PISTA", days.length >= 2 ? "presente" : "ausente", days.length >= 2 ? `pista ${worstLane} com até ${nf(maxR, 1)} × a outra pista (${days.length} dias)` : `pistas parecidas (razão máxima ${nf(maxR, 1)})`);
  } else set("UMA_PISTA", "nao_verificavel", "não se aplica a este indicador");

  // Idade
  if (ageW == null) {
    set("LOTE_JOVEM", "nao_verificavel", "sem lote");
    set("LOTE_VELHO", "nao_verificavel", "sem lote");
  } else {
    set("LOTE_JOVEM", ageW <= 30 ? "presente" : "ausente", `lote com ${ageW} semanas`);
    set("LOTE_VELHO", ageW >= 70 ? "presente" : "ausente", `lote com ${ageW} semanas`);
  }
  // Peso do ovo
  const ew = vals(s, house, "prod.peso_ovo", addDays(d, -13), d);
  if (ew.length < 5 || !flock) set("PESO_OVO_SUBINDO", "nao_verificavel", "sem peso do ovo suficiente");
  else {
    const sl = slope(ew.map((x) => x.v)) ?? 0;
    const last7 = mean(ew.slice(-7).map((x) => x.v))!;
    const std = ctx.strainStd.at(flock.strainCode, "prod.peso_ovo", ageWeeksDecimal(addDays(d, -3), flock.hatchDate)) ?? last7;
    const up = sl >= 0.08 || last7 - std >= 1.0;
    set("PESO_OVO_SUBINDO", up ? "presente" : "ausente", `peso do ovo ${nf(last7)} g (${last7 - std >= 0 ? "+" : "−"}${nf(Math.abs(last7 - std))} g contra a curva; ${nf(sl, 2)} g/dia)`);
  }
  // Mortalidade
  const mortBase = median(vals(s, house, "mort.diaria", bFrom, bTo).map((x) => x.v));
  const mortWin = vals(s, house, "mort.diaria", addDays(a, -3), d);
  if (mortBase == null || !mortWin.length) set("MORT_ALTA", "nao_verificavel", "sem dado de mortalidade");
  else {
    const mx = mortWin.reduce((p, c) => (c.v > p.v ? c : p));
    set("MORT_ALTA", mx.v >= 2 * mortBase ? "presente" : "ausente", `mortalidade máxima de ${nf(mx.v, 3)}% em ${dm(mx.d)} (mediana da base ${nf(mortBase, 3)}%)`);
  }
  let deaths = 0;
  let prol = 0;
  let heat = 0;
  for (let x = addDays(a, -3); x <= d; x = addDays(x, 1)) {
    deaths += s.get(house, "mort.mortes", x) ?? 0;
    prol += s.get(house, "mort.prolapso", x) ?? 0;
    heat += s.get(house, "mort.calor", x) ?? 0;
  }
  const baseProl = mean(vals(s, house, "mort.prolapso", bFrom, bTo).map((x) => x.v)) ?? 0;
  const nDays = diffDays(addDays(a, -3), d) + 1;
  set("MORT_PROLAPSO", deaths > 0 && (prol >= 0.3 * deaths || (baseProl > 0 && prol >= 2 * baseProl * nDays)) ? "presente" : "ausente", `${prol} mortes por prolapso de ${deaths} no período (${nf(deaths ? (prol / deaths) * 100 : 0, 0)}%)`);
  set("MORT_CALOR", deaths > 0 && heat >= 0.3 * deaths ? "presente" : "ausente", `${heat} mortes por calor de ${deaths} no período (${nf(deaths ? (heat / deaths) * 100 : 0, 0)}%)`);

  // Forma do desvio
  if (m) {
    const devs: Array<{ x: string; v: number }> = [];
    for (let x = a; x <= d; x = addDays(x, 1)) {
      const v = deviationScore(s, house, type, x, a);
      if (v != null) devs.push({ x, v });
    }
    if (devs.length < 2) {
      set("ABRUPTO", "nao_verificavel", "poucos dias desde o desvio");
      set("GRADUAL", "nao_verificavel", "poucos dias desde o desvio");
    } else {
      const top = devs.reduce((p, c) => (c.v > p.v ? c : p));
      const early = devs.find((y) => y.x <= addDays(a, 3) && y.v >= 0.7 * top.v);
      set("ABRUPTO", early ? "presente" : "ausente", early ? (diffDays(a, early.x) === 0 ? `atingiu ${nf((early.v / top.v) * 100, 0)}% do desvio máximo já no primeiro dia` : `atingiu ${nf((early.v / top.v) * 100, 0)}% do desvio máximo em ${diffDays(a, early.x)} dia(s)`) : "o desvio cresceu devagar");
      const growing = !early && diffDays(a, top.x) >= 6;
      set("GRADUAL", growing ? "presente" : diffDays(a, d) < 6 && !early ? "nao_verificavel" : "ausente", growing ? `o desvio cresceu por ${diffDays(a, top.x) + 1} dias` : early ? "desvio rápido, não gradual" : "ainda sem 7 dias de desvio");
    }
  } else {
    set("ABRUPTO", "nao_verificavel", "—");
    set("GRADUAL", "nao_verificavel", "—");
  }

  // Ração compartilhada
  const myBatches = ctx.feedBatches.filter((b) => b.houses.includes(house) && b.deliveredOn >= addDays(a, -30) && b.deliveredOn <= addDays(a, -5));
  if (!myBatches.length || !m) set("CARGA_COMPARTILHADA", "nao_verificavel", "sem carga de ração registrada entre a−30 e a−5");
  else {
    let hit: FeedBatch | null = null;
    let sharers: string[] = [];
    for (const b of myBatches) {
      const others = b.houses.filter((h) => h !== house && s.flockAt(h, a));
      const withDev = others.filter((h) => (maxScore(s, h, type, addDays(a, -2), d, a) ?? 0) >= 0.5);
      const outside = s.houses.filter((h) => !b.houses.includes(h) && s.flockAt(h, a));
      const outsideClean = outside.filter((h) => (maxScore(s, h, type, addDays(a, -2), d, a) ?? 0) < 0.5);
      if (withDev.length >= 1 && outsideClean.length >= 1) {
        hit = b;
        sharers = withDev;
        break;
      }
    }
    set("CARGA_COMPARTILHADA", hit ? "presente" : "ausente", hit ? `a carga ${hit.code} (entregue em ${dm(hit.deliveredOn)}) também foi para ${sharers.join(", ")}, que mostram o mesmo desvio; galpões sem essa carga não mostram` : `as cargas recebidas (${myBatches.map((b) => b.code).join(", ")}) não explicam o desvio`);
  }

  // Eventos
  const evs = eventsUntil(ctx, house, ref.knownUntil && ref.knownUntil > d ? ref.knownUntil : d).filter((e) => e.startDate <= d);
  const evIn = (types: string[], from: string, to: string) => evs.filter((e) => types.includes(e.typeCode) && e.startDate >= from && e.startDate <= to);
  const evSig = (code: SignalCode, types: string[], from: string, to: string, label: string) => {
    const x = evIn(types, from, to);
    set(code, x.length ? "presente" : "ausente", x.length ? `${label} registrado em ${dm(x[0].startDate)} (${x[0].title})` : `nenhum registro de ${label.toLowerCase()} no período`);
  };
  evSig("EVENTO_TROCA_RACAO", ["manejo.troca_racao"], addDays(a, -30), addDays(a, -5), "Troca de ração");
  evSig("EVENTO_VACINA", ["sanitario.vacinacao"], addDays(a, -10), a, "Vacinação");
  evSig("EVENTO_ENERGIA", ["ambiente.queda_energia"], addDays(a, -2), d, "Queda de energia");
  evSig("EVENTO_LUZ", ["manejo.programa_luz"], addDays(a, -21), a, "Mudança no programa de luz");

  // Laboratório
  const labs = (ctx.lab.get(house) ?? []).filter((x) => x.date <= d);
  const recent = labs.filter((x) => x.date >= addDays(a, -14)).at(-1);
  if (!recent) set("LAB_CASCA_PIOR", "nao_verificavel", "sem amostra de casca entre a−14 e hoje");
  else {
    const prev = labs.filter((x) => x.date < recent.date).slice(-4);
    const ms = mean(prev.map((x) => x.strength));
    const mg = mean(prev.map((x) => x.gravity));
    const worse = (recent.strength != null && ms != null && recent.strength <= ms - 0.25) || (recent.gravity != null && mg != null && recent.gravity <= mg - 0.002);
    set("LAB_CASCA_PIOR", worse ? "presente" : "ausente", `amostra de ${dm(recent.date)}: resistência ${nf(recent.strength, 2)} kgf (média das 4 anteriores ${nf(ms, 2)}), gravidade ${nf(recent.gravity, 4)}`);
  }
  // Noturna e amônia
  const night = vals(s, house, "amb.temp_noturna_max", addDays(a, -1), d);
  if (!night.length) set("TEMP_NOTURNA", "nao_verificavel", "sem leitura noturna");
  else {
    const mx = night.reduce((p, c) => (c.v > p.v ? c : p));
    set("TEMP_NOTURNA", mx.v > 31 ? "presente" : "ausente", `máxima noturna (22h–05h) de ${nf(mx.v)} °C em ${dm(mx.d)}`);
  }
  const nh3Base = mean(vals(s, house, "amb.nh3_max", bFrom, bTo).map((x) => x.v));
  const nh3Now = mean(vals(s, house, "amb.nh3_max", addDays(a, -2), d).map((x) => x.v));
  if (nh3Base == null || nh3Now == null) set("NH3_ALTA", "nao_verificavel", "sem leitura de amônia (só últimos 60 dias)");
  else set("NH3_ALTA", nh3Now >= nh3Base + 3 ? "presente" : "ausente", `amônia máxima média de ${nf(nh3Now)} ppm contra ${nf(nh3Base)} ppm na base`);
  // Sinais clínicos
  const sanit = evs.filter((e) => e.typeCode.startsWith("sanitario.") && e.startDate >= addDays(a, -10) && e.startDate <= d);
  const resp = sanit.find((e) => Array.isArray(e.details?.sinais_clinicos) && (e.details.sinais_clinicos as string[]).includes("sinais respiratórios"));
  set("SINAIS_RESPIRATORIOS", resp ? "presente" : sanit.length ? "ausente" : "nao_verificavel", resp ? `sinais respiratórios registrados em ${dm(resp.startDate)}` : sanit.length ? "evento sanitário sem sinais respiratórios" : "nenhum evento sanitário com sinais clínicos registrado");
  set("DESPIGMENTACAO", "nao_verificavel", "o contador da beta não mede despigmentação");
  return out;
}
