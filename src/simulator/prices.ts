/** Preços semanais (Parte 7.10) e cargas de ração. */
import { addDays, diffDays, weekStart } from "@/lib/dates";
import { feedBatchIdFor } from "@/lib/ids";
import type { FeedBatch, WeeklyPrices } from "@/engine/types";
import { FEED, PRICES } from "./config";
import type { RngFactory } from "./prng";

export interface PriceOverrides {
  /** Preço do ovo comercial das 6 últimas semanas (da mais antiga para a mais recente). */
  calibEgg?: number[];
}

/**
 * Passeio aleatório multiplicativo com reversão à média, a partir de uma âncora fixa (primeiro domingo ≤ D_start).
 * As 6 semanas que terminam na semana de D_end são fixadas pela calibração.
 */
export function generatePrices(rngs: RngFactory, dStart: string, dEnd: string, to: string, ov: PriceOverrides = {}): WeeklyPrices[] {
  const rEgg = rngs.fresh("precos:ovo");
  const rFeed = rngs.fresh("precos:racao");
  const out: WeeklyPrices[] = [];
  const lastWeek = weekStart(dEnd);
  const calibStart = addDays(lastWeek, -35);
  const calibEgg = ov.calibEgg ?? PRICES.calibEgg;
  let egg = PRICES.eggStart;
  let feed = PRICES.feedStart;
  for (let ws = weekStart(dStart); ws <= weekStart(to); ws = addDays(ws, 7)) {
    if (out.length > 0) {
      egg = Math.exp(Math.log(egg) + PRICES.eggReversion * (Math.log(PRICES.eggStart) - Math.log(egg)) + rEgg.normal(0, PRICES.eggSd));
      egg = clamp(egg, PRICES.eggMin, PRICES.eggMax);
      feed = Math.exp(Math.log(feed) + PRICES.feedReversion * (Math.log(PRICES.feedStart) - Math.log(feed)) + rFeed.normal(0, PRICES.feedSd));
      feed = clamp(feed, PRICES.feedMin, PRICES.feedMax);
    }
    let e = egg;
    let f = feed;
    if (ws >= calibStart && ws <= lastWeek) {
      const k = diffDays(calibStart, ws) / 7;
      e = calibEgg[k];
      f = PRICES.calibFeed[k];
      egg = e;
      feed = f;
    }
    out.push({
      weekStart: ws,
      ovo_comercial_dz: round2(e),
      ovo_trincado_dz: round2(e * PRICES.crackedShare),
      ovo_sujo_dz: round2(e * PRICES.dirtyShare),
      racao_kg: round2(f),
      ave_descarte_un: PRICES.cullBird,
    });
  }
  return out;
}

/**
 * Cargas de ração: a cada 14 dias por grupo. Grupo A ancorado na carga de D−30 (cenário S4) com carga
 * corretiva em D−8; grupos B e C com âncoras deslocadas.
 */
export function generateFeedBatches(dStart: string, dEnd: string, to: string, priceFor: (date: string) => number): FeedBatch[] {
  const anchors: Record<string, number> = { A: -30, B: -26, C: -22 };
  const all: Array<{ group: string; date: string }> = [];
  for (const [group, off] of Object.entries(anchors)) {
    const anchor = addDays(dEnd, off);
    // para trás
    for (let d = anchor; d >= addDays(dStart, -14); d = addDays(d, -FEED.everyDays)) all.push({ group, date: d });
    if (group === "A") {
      // carga do S4 dura até a corretiva em D−8; depois segue a cada 14 dias
      for (let d = addDays(dEnd, -8); d <= to; d = addDays(d, FEED.everyDays)) all.push({ group, date: d });
    } else {
      for (let d = addDays(anchor, FEED.everyDays); d <= to; d = addDays(d, FEED.everyDays)) all.push({ group, date: d });
    }
  }
  all.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.group < b.group ? -1 : 1));
  return all.map((b, i) => {
    const code = `CARGA-${String(i + 1).padStart(4, "0")}`;
    return {
      id: feedBatchIdFor(`${b.group}:${b.date}`),
      code,
      deliveredOn: b.date,
      group: b.group,
      houses: FEED.groups[b.group],
      pricePerKg: priceFor(b.date),
      calciumSpec: FEED.calciumSpec,
      supplier: FEED.supplier,
      formulation: FEED.formulation,
    };
  });
}

/** Carga vigente de um galpão numa data. */
export function batchFor(batches: FeedBatch[], house: string, date: string): FeedBatch | undefined {
  let best: FeedBatch | undefined;
  for (const b of batches) if (b.houses.includes(house) && b.deliveredOn <= date && (!best || b.deliveredOn > best.deliveredOn)) best = b;
  return best;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}
function round2(v: number) {
  return Math.round(v * 100) / 100;
}
