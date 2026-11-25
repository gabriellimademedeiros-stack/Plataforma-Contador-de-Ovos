/**
 * Grava um Dataset (ou parte dele) no banco. Usado pelo reset completo (scripts) e pelo avanço diário (cron).
 * Tabelas grandes usam COPY quando disponível (scripts) ou INSERT em lotes de 2.000 linhas.
 */
import type postgres from "postgres";
import { farmInstant } from "@/lib/dates";
import { TENANT_ID, deviceIdFor, feedBatchIdFor, flockIdFor, houseIdFor, strainIdFor, uuidFromName } from "@/lib/ids";
import { EGG_CLASSES, type Dataset, type EventRecord } from "@/engine/types";
import { MODEL_VERSION } from "@/simulator/config";

type Sql = ReturnType<typeof postgres>;
export type Row = Record<string, unknown>;
export type BulkWriter = (table: string, rows: Row[]) => Promise<number>;

const counterOf = (house: string) => `CNT-${house.slice(1).padStart(4, "0")}`;

export function flockRows(ds: Dataset) {
  const flocks = ds.flocks.map((f) => ({
    id: f.id,
    tenant_id: TENANT_ID,
    code: f.code,
    strain_id: strainIdFor(f.strainCode),
    hatch_date: f.hatchDate,
    birds_housed: f.birdsHoused,
    chick_cost_brl: f.chickCostBrl,
    planned_cull_age_weeks: f.plannedCullAgeWeeks,
    status: f.status,
    quality_offset_pp: f.qualityOffset,
  }));
  const placements = ds.flocks.map((f) => ({
    id: uuidFromName(`placement:${f.code}`),
    flock_id: f.id,
    house_id: houseIdFor(f.houseCode),
    start_date: f.startDate,
    end_date: f.endDate,
    birds_in: f.birdsHoused,
  }));
  const movements: Row[] = [];
  for (const f of ds.flocks) {
    movements.push({ id: uuidFromName(`mov:${f.code}:aloj`), flock_id: f.id, house_id: houseIdFor(f.houseCode), date: f.startDate, type: "alojamento", qty: f.birdsHoused });
    if (f.endDate) {
      const last = [...ds.daily].reverse().find((r) => r.flock === f.code);
      const remaining = last ? last.birdsStart - last.deaths - last.culls : 0;
      movements.push({ id: uuidFromName(`mov:${f.code}:desc`), flock_id: f.id, house_id: houseIdFor(f.houseCode), date: f.endDate, type: "descarte_final", qty: Math.max(0, remaining) });
    }
  }
  return { flocks, placements, movements };
}

export function dailyRecordRows(ds: Dataset): Row[] {
  return ds.daily.map((r) => ({
    id: uuidFromName(`dr:${r.house}:${r.date}`),
    tenant_id: TENANT_ID,
    house_id: houseIdFor(r.house),
    flock_id: flockIdFor(r.flock),
    date: r.date,
    birds_start: r.birdsStart,
    deaths: r.deaths,
    deaths_by_cause: r.deathsByCause,
    culls: r.culls,
    feed_kg: r.feedKg,
    water_l: r.waterL,
    egg_weight_g: r.eggWeightG,
    light_hours: r.lightHours,
    feed_batch_id: r.feedBatch ? feedBatchIdFromCode(ds, r.feedBatch) : null,
    source: r.source === "campo" ? "campo" : "simulado",
  }));
}

const batchIdCache = new WeakMap<Dataset, Map<string, string>>();
function feedBatchIdFromCode(ds: Dataset, code: string): string | null {
  let m = batchIdCache.get(ds);
  if (!m) {
    m = new Map(ds.feedBatches.map((b) => [b.code, b.id]));
    batchIdCache.set(ds, m);
  }
  return m.get(code) ?? null;
}

export function eggCountRows(ds: Dataset): Row[] {
  const rows: Row[] = [];
  for (const e of ds.eggDaily) {
    const ws = farmInstant(e.date, 6).toISOString();
    for (const lane of [1, 2] as const) {
      for (const cls of EGG_CLASSES) {
        rows.push({
          tenant_id: TENANT_ID,
          house_id: houseIdFor(e.house),
          device_id: deviceIdFor(counterOf(e.house)),
          date: e.date,
          window_start: ws,
          window_minutes: 1440,
          lane,
          egg_class: cls,
          qty: e.lanes[lane][cls],
          mean_conf: e.meanConf,
          model_version: MODEL_VERSION,
          message_id: null,
          quality_flag: e.qualityFlag,
          source: "simulado",
        });
      }
    }
  }
  for (const h of ds.eggHourly) {
    for (const cls of EGG_CLASSES) {
      rows.push({
        tenant_id: TENANT_ID,
        house_id: houseIdFor(h.house),
        device_id: deviceIdFor(counterOf(h.house)),
        date: h.date,
        window_start: h.windowStart,
        window_minutes: h.windowMinutes,
        lane: h.lane,
        egg_class: cls,
        qty: h.counts[cls],
        mean_conf: h.meanConf,
        model_version: MODEL_VERSION,
        message_id: h.messageId ?? null,
        quality_flag: 0,
        source: h.source,
      });
    }
  }
  return rows;
}

export function envRows(ds: Dataset): Row[] {
  return ds.env.map((e) => ({
    house_id: e.house ? houseIdFor(e.house) : null,
    date: e.date,
    temp_max: e.tempMax,
    temp_min: e.tempMin,
    temp_mean: e.tempMean,
    rh_mean: e.rhMean,
    hours_above_30: e.hoursAbove30,
    hours_above_32: e.hoursAbove32,
    degree_hours_30: e.degreeHours30,
    nh3_max: e.nh3Max,
    night_max: e.nightMax,
  }));
}

export function sensorRows(ds: Dataset): Row[] {
  return ds.sensors.map((s) => ({
    tenant_id: TENANT_ID,
    house_id: s.house ? houseIdFor(s.house) : null,
    ts: s.ts,
    metric_code: s.metric,
    value: s.value,
    quality_flag: 0,
    source: s.source,
  }));
}

export function eventRows(events: EventRecord[]) {
  const ev = events.map((e) => ({
    id: e.id,
    tenant_id: TENANT_ID,
    type_code: e.typeCode,
    title: e.title,
    starts_at: e.startsAt,
    ends_at: e.endsAt,
    severity: e.severity,
    certainty: e.certainty,
    confirmed_by: e.confirmedBy,
    description: e.description,
    details: e.details,
    action_taken: e.actionTaken,
    cost_brl: e.costBrl,
    source: e.source,
    created_by: e.createdBy,
    created_at: e.createdAt,
    completeness: e.completeness,
  }));
  const scopes = events.flatMap((e) =>
    e.houses.map((h) => ({ event_id: e.id, house_id: houseIdFor(h), flock_id: e.flocks[h] ? flockIdFor(e.flocks[h]) : null })),
  );
  const history = events.flatMap((e) =>
    e.certaintyHistory.map((c, i) => ({
      id: uuidFromName(`ech:${e.id}:${i}`),
      event_id: e.id,
      at: c.at,
      from_certainty: c.from,
      to_certainty: c.to,
      by_user: c.by,
      note: c.note,
    })),
  );
  return { ev, scopes, history };
}

/**
 * Grava todos os dados brutos do Dataset (passos 4 e 5 do reset).
 * `bulk` decide como gravar tabelas grandes (COPY nos scripts).
 */
export async function writeDataset(sql: Sql, ds: Dataset, bulk: BulkWriter, insert: BulkWriter, opts: { includeEvents?: boolean } = {}) {
  const counts: Record<string, number> = {};
  const fr = flockRows(ds);
  counts.flocks = await insert("flocks", fr.flocks);
  counts.flock_placements = await insert("flock_placements", fr.placements);
  counts.flock_movements = await insert("flock_movements", fr.movements);

  counts.feed_batches = await insert(
    "feed_batches",
    ds.feedBatches.map((b) => ({
      id: b.id,
      tenant_id: TENANT_ID,
      code: b.code,
      delivered_on: b.deliveredOn,
      supplier: b.supplier,
      formulation: b.formulation,
      house_ids: b.houses.map(houseIdFor),
      price_per_kg: b.pricePerKg,
      calcium_pct_spec: b.calciumSpec,
      lab_note: null,
    })),
  );
  counts.daily_records = await bulk("daily_records", dailyRecordRows(ds));
  counts.egg_counts = await bulk("egg_counts", eggCountRows(ds));
  counts.daily_env = await bulk("daily_env", envRows(ds));
  counts.sensor_readings = await bulk("sensor_readings", sensorRows(ds));
  counts.weather_forecast = await insert(
    "weather_forecast",
    ds.forecast.map((f) => ({ farm_id: ds.farm.id, date: f.date, temp_max: f.tempMax, temp_min: f.tempMin, generated_on: f.generatedOn })),
  );
  counts.body_weight_samples = await insert(
    "body_weight_samples",
    ds.bodyWeights.map((b) => ({
      id: uuidFromName(`bw:${b.house}:${b.date}`),
      house_id: houseIdFor(b.house),
      flock_id: flockIdFor(b.flock),
      date: b.date,
      n: b.n,
      mean_g: b.meanG,
      cv_pct: b.cvPct,
      uniformity_pct: b.uniformityPct,
    })),
  );
  counts.lab_samples = await insert(
    "lab_samples",
    ds.lab.map((s) => ({
      id: s.id,
      tenant_id: TENANT_ID,
      house_id: houseIdFor(s.house),
      flock_id: flockIdFor(s.flock),
      date: s.date,
      type: "casca",
      n_eggs: s.n,
      strength_kgf: s.strength,
      thickness_mm: s.thickness,
      specific_gravity: s.gravity,
      haugh: s.haugh,
      egg_weight_g: s.eggWeight,
      yolk_color: s.yolkColor,
      notes: s.notes ?? null,
    })),
  );
  counts.shelf_life_tests = await insert(
    "shelf_life_tests",
    ds.shelfLife.map((t) => ({
      id: t.id,
      tenant_id: TENANT_ID,
      house_id: houseIdFor(t.house),
      flock_id: flockIdFor(t.flock),
      start_date: t.startDate,
      storage_temp_c: t.storageTemp,
      storage_rh_pct: t.storageRh,
      schedule_days: t.schedule,
    })),
  );
  counts.shelf_life_measurements = await insert(
    "shelf_life_measurements",
    ds.shelfLife.flatMap((t) =>
      t.measurements.map((m) => ({
        id: uuidFromName(`slm:${t.id}:${m.day}`),
        test_id: t.id,
        day: m.day,
        n: m.n,
        haugh_mean: m.haugh,
        weight_loss_pct: m.weightLossPct,
        air_cell_mm: m.airCellMm,
      })),
    ),
  );
  counts.prices = await insert(
    "prices",
    ds.prices.flatMap((p) =>
      (["ovo_comercial_dz", "ovo_trincado_dz", "ovo_sujo_dz", "racao_kg", "ave_descarte_un"] as const).map((item) => ({
        tenant_id: TENANT_ID,
        week_start: p.weekStart,
        item,
        value_brl: p[item],
      })),
    ),
  );
  if (opts.includeEvents !== false) {
    const er = eventRows(ds.events);
    counts.events = await insert("events", er.ev);
    counts.event_scopes = await insert("event_scopes", er.scopes);
    counts.event_certainty_history = await insert("event_certainty_history", er.history);
  }
  return counts;
}

export { feedBatchIdFor };
