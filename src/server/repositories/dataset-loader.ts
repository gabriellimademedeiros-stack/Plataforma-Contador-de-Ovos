/**
 * Lê os dados brutos do banco e monta o Dataset em memória que o motor consome.
 * Usado pelo recálculo (recomputeHouseDay), avanço diário, cenários ao vivo e `demo:compute`.
 */
import type postgres from "postgres";
import { DEFAULT_PHASE_BOUNDS, productiveDate, type PhaseBounds } from "@/lib/dates";
import { EGG_CLASSES, emptyCounts, type ClassCounts, type Dataset, type DailyEggCount, type EggClass, type EventRecord } from "@/engine/types";
import type { StrainStandardRow } from "@/engine/standards/strain";
import type { InternalStandardRow } from "@/engine/standards/internal";

type Sql = ReturnType<typeof postgres>;

export interface LoadOptions {
  from?: string;
  to?: string;
  includeHourly?: boolean;
}

const d10 = (v: unknown) => (v == null ? null : typeof v === "string" ? v.slice(0, 10) : (v as Date).toISOString().slice(0, 10));
const iso = (v: unknown) => (v == null ? null : typeof v === "string" ? new Date(v).toISOString() : (v as Date).toISOString());
const num = (v: unknown) => (v == null ? null : Number(v));

export async function loadReferenceData(sql: Sql) {
  const [farm] = await sql`select * from app.farms limit 1`;
  const houses = await sql`select * from app.houses order by sort_order`;
  const strains = await sql`select * from app.strains order by code`;
  const flocks = await sql`
    select f.*, s.code as strain_code, p.start_date, p.end_date, h.code as house_code
    from app.flocks f join app.strains s on s.id = f.strain_id
    join app.flock_placements p on p.flock_id = f.id join app.houses h on h.id = p.house_id
    order by p.start_date`;
  return { farm, houses, strains, flocks };
}

export async function loadStrainStandards(sql: Sql): Promise<StrainStandardRow[]> {
  const rows = await sql`select s.code, ss.age_week, ss.metric_code, ss.value from app.strain_standards ss join app.strains s on s.id = ss.strain_id`;
  return rows.map((r) => ({ strainCode: r.code, ageWeek: Number(r.age_week), metric: r.metric_code, value: Number(r.value) }));
}

export async function loadInternalStandards(sql: Sql): Promise<InternalStandardRow[]> {
  const rows = await sql`select s.code, i.* from app.internal_standards i join app.strains s on s.id = i.strain_id`;
  return rows.map((r) => ({
    strainCode: r.code,
    ageWeek: Number(r.age_week),
    metric: r.metric_code,
    nFlocks: Number(r.n_flocks),
    mean: num(r.mean),
    median: num(r.median),
    p25: num(r.p25),
    p75: num(r.p75),
    excludedWeeks: Number(r.excluded_weeks),
  }));
}

export async function loadEvents(sql: Sql, houseCodeById: Map<string, string>, flockCodeById: Map<string, string>): Promise<EventRecord[]> {
  const evs = await sql`select * from app.events order by starts_at`;
  const scopes = await sql`select * from app.event_scopes`;
  const hist = await sql`select * from app.event_certainty_history order by at`;
  const scopeBy = new Map<string, Array<{ house: string; flock: string | null }>>();
  for (const s of scopes) {
    let a = scopeBy.get(s.event_id);
    if (!a) scopeBy.set(s.event_id, (a = []));
    a.push({ house: houseCodeById.get(s.house_id)!, flock: s.flock_id ? flockCodeById.get(s.flock_id) ?? null : null });
  }
  const histBy = new Map<string, EventRecord["certaintyHistory"]>();
  for (const h of hist) {
    let a = histBy.get(h.event_id);
    if (!a) histBy.set(h.event_id, (a = []));
    a.push({ at: iso(h.at)!, from: h.from_certainty, to: h.to_certainty, by: h.by_user, note: h.note });
  }
  return evs.map((e) => {
    const sc = scopeBy.get(e.id) ?? [];
    const startsAt = iso(e.starts_at)!;
    const endsAt = iso(e.ends_at);
    return {
      id: e.id,
      typeCode: e.type_code,
      title: e.title,
      startsAt,
      endsAt,
      startDate: productiveDate(new Date(startsAt)),
      endDate: endsAt ? productiveDate(new Date(endsAt)) : null,
      severity: e.severity,
      certainty: e.certainty,
      confirmedBy: e.confirmed_by,
      description: e.description,
      details: e.details ?? {},
      actionTaken: e.action_taken,
      costBrl: num(e.cost_brl),
      source: e.source,
      createdBy: e.created_by,
      createdAt: iso(e.created_at)!,
      completeness: e.completeness,
      houses: sc.map((s) => s.house).filter(Boolean),
      flocks: Object.fromEntries(sc.filter((s) => s.flock).map((s) => [s.house, s.flock!])),
      certaintyHistory: histBy.get(e.id) ?? [],
    } satisfies EventRecord;
  });
}

export async function loadDataset(sql: Sql, opts: LoadOptions = {}): Promise<Dataset> {
  const ref = await loadReferenceData(sql);
  const houseCodeById = new Map<string, string>(ref.houses.map((h) => [h.id, h.code]));
  const flockCodeById = new Map<string, string>(ref.flocks.map((f) => [f.id, f.code]));
  const [range] = await sql`select min(date) as a, max(date) as b from app.daily_records`;
  const from = opts.from ?? d10(range.a)!;
  const to = opts.to ?? d10(range.b)!;
  // acumulados (OAA, mortalidade) exigem desde o alojamento dos lotes ativos no período
  const flocksInRange = ref.flocks.filter((f) => d10(f.start_date)! <= to && (f.end_date == null || d10(f.end_date)! >= from));
  const rawFrom = flocksInRange.reduce((m, f) => (d10(f.start_date)! < m ? d10(f.start_date)! : m), from);

  const [daily, eggs, env, bws, labs, shelf, meas, prices, costs, batches, forecast] = await Promise.all([
    sql`select d.*, b.code as batch_code from app.daily_records d left join app.feed_batches b on b.id = d.feed_batch_id where d.date between ${rawFrom} and ${to} order by d.date`,
    sql`select house_id, date, lane, egg_class, sum(qty)::int as qty, avg(mean_conf) as conf, max(quality_flag) as qf
        from app.egg_counts where date between ${rawFrom} and ${to} and window_minutes = 1440 group by house_id, date, lane, egg_class`,
    sql`select * from app.daily_env where date between ${rawFrom} and ${to}`,
    sql`select * from app.body_weight_samples where date between ${rawFrom} and ${to} order by date`,
    sql`select * from app.lab_samples where date between ${rawFrom} and ${to} order by date`,
    sql`select * from app.shelf_life_tests order by start_date`,
    sql`select * from app.shelf_life_measurements order by day`,
    sql`select * from app.prices order by week_start`,
    sql`select * from app.cost_params`,
    sql`select * from app.feed_batches order by delivered_on`,
    sql`select * from app.weather_forecast order by date`,
  ]);

  // contagens ao vivo (janelas de 1 min) do dia corrente entram somadas no dia
  const live = await sql`select house_id, date, lane, egg_class, sum(qty)::int as qty, avg(mean_conf) as conf, max(quality_flag) as qf
        from app.egg_counts where date between ${from} and ${to} and window_minutes = 1 and source = 'ao_vivo'
        and not exists (select 1 from app.egg_counts e2 where e2.house_id = egg_counts.house_id and e2.date = egg_counts.date and e2.window_minutes = 1440)
        group by house_id, date, lane, egg_class`;

  const eggMap = new Map<string, DailyEggCount>();
  for (const r of [...eggs, ...live]) {
    const house = houseCodeById.get(r.house_id)!;
    const date = d10(r.date)!;
    const k = `${house}|${date}`;
    let e = eggMap.get(k);
    if (!e) eggMap.set(k, (e = { house, date, lanes: { 1: emptyCounts(), 2: emptyCounts() }, meanConf: Number(r.conf ?? 0.95), qualityFlag: Number(r.qf ?? 0) }));
    const lane = Number(r.lane) as 1 | 2;
    (e.lanes[lane] as ClassCounts)[r.egg_class as EggClass] += Number(r.qty);
    e.qualityFlag = Math.max(e.qualityFlag, Number(r.qf ?? 0));
  }

  let sensors: Dataset["sensors"] = [];
  let eggHourly: Dataset["eggHourly"] = [];
  if (opts.includeHourly) {
    const s = await sql`select * from app.sensor_readings where ts >= ${from}::date - interval '1 day' order by ts`;
    sensors = s.map((r) => ({ house: r.house_id ? houseCodeById.get(r.house_id)! : null, ts: iso(r.ts)!, metric: r.metric_code, value: Number(r.value), source: r.source }));
    const h = await sql`select * from app.egg_counts where date between ${from} and ${to} and window_minutes in (60, 1) order by window_start`;
    const hm = new Map<string, Dataset["eggHourly"][number]>();
    for (const r of h) {
      const house = houseCodeById.get(r.house_id)!;
      const k = `${house}|${iso(r.window_start)}|${r.lane}|${r.window_minutes}`;
      let x = hm.get(k);
      if (!x)
        hm.set(
          k,
          (x = { house, date: d10(r.date)!, windowStart: iso(r.window_start)!, windowMinutes: Number(r.window_minutes) as 60 | 1, lane: Number(r.lane) as 1 | 2, counts: emptyCounts(), meanConf: Number(r.mean_conf ?? 0.95), source: r.source, messageId: r.message_id }),
        );
      x.counts[r.egg_class as EggClass] += Number(r.qty);
    }
    eggHourly = [...hm.values()];
  }

  const measBy = new Map<string, typeof meas>();
  for (const m of meas) {
    let a = measBy.get(m.test_id);
    if (!a) measBy.set(m.test_id, (a = [] as unknown as typeof meas));
    a.push(m);
  }
  const priceWeeks = new Map<string, Record<string, number>>();
  for (const p of prices) {
    const ws = d10(p.week_start)!;
    let x = priceWeeks.get(ws);
    if (!x) priceWeeks.set(ws, (x = {}));
    x[p.item] = Number(p.value_brl);
  }

  const events = await loadEvents(sql, houseCodeById, flockCodeById);

  return {
    seed: 0,
    dStart: from,
    dEnd: to,
    farm: {
      id: ref.farm.id,
      tenantId: ref.farm.tenant_id,
      name: ref.farm.name,
      city: ref.farm.city,
      timezone: ref.farm.timezone,
      cutoffHour: Number(ref.farm.cutoff_hour),
      weekStartDow: Number(ref.farm.week_start_dow),
      phaseBounds: (ref.farm.phase_bounds as PhaseBounds) ?? DEFAULT_PHASE_BOUNDS,
    },
    houses: ref.houses.map((h) => ({
      id: h.id,
      code: h.code,
      name: h.name,
      capacity: Number(h.capacity),
      coolingDelta: Number(h.cooling_delta_c),
      color: h.color,
      sortOrder: Number(h.sort_order),
      lanes: Number(h.lanes),
    })),
    strains: ref.strains.map((s) => ({ id: s.id, code: s.code, name: s.name, shellColor: s.shell_color })),
    flocks: ref.flocks.map((f) => ({
      id: f.id,
      code: f.code,
      strainCode: f.strain_code,
      houseCode: f.house_code,
      hatchDate: d10(f.hatch_date)!,
      birdsHoused: Number(f.birds_housed),
      chickCostBrl: Number(f.chick_cost_brl),
      plannedCullAgeWeeks: Number(f.planned_cull_age_weeks),
      status: f.status,
      qualityOffset: Number(f.quality_offset_pp),
      startDate: d10(f.start_date)!,
      endDate: d10(f.end_date),
    })),
    daily: daily.map((r) => ({
      house: houseCodeById.get(r.house_id)!,
      flock: flockCodeById.get(r.flock_id)!,
      date: d10(r.date)!,
      birdsStart: Number(r.birds_start),
      deaths: Number(r.deaths),
      deathsByCause: r.deaths_by_cause ?? {},
      culls: Number(r.culls),
      feedKg: num(r.feed_kg),
      waterL: num(r.water_l),
      eggWeightG: num(r.egg_weight_g),
      lightHours: num(r.light_hours),
      feedBatch: r.batch_code ?? null,
      source: r.source,
    })),
    eggDaily: [...eggMap.values()].sort((a, b) => (a.house + a.date < b.house + b.date ? -1 : 1)),
    eggHourly,
    env: env.map((e) => ({
      house: e.house_id ? houseCodeById.get(e.house_id)! : null,
      date: d10(e.date)!,
      tempMax: Number(e.temp_max),
      tempMin: Number(e.temp_min),
      tempMean: Number(e.temp_mean),
      rhMean: Number(e.rh_mean),
      hoursAbove30: Number(e.hours_above_30),
      hoursAbove32: Number(e.hours_above_32),
      degreeHours30: Number(e.degree_hours_30),
      nh3Max: num(e.nh3_max),
      nightMax: Number(e.night_max),
    })),
    sensors,
    forecast: forecast.map((f) => ({ date: d10(f.date)!, tempMax: Number(f.temp_max), tempMin: Number(f.temp_min), generatedOn: d10(f.generated_on)! })),
    feedBatches: batches.map((b) => ({
      id: b.id,
      code: b.code,
      deliveredOn: d10(b.delivered_on)!,
      group: "",
      houses: (b.house_ids as string[]).map((id) => houseCodeById.get(id)!),
      pricePerKg: Number(b.price_per_kg),
      calciumSpec: Number(b.calcium_pct_spec),
      supplier: b.supplier,
      formulation: b.formulation,
    })),
    bodyWeights: bws.map((b) => ({
      house: houseCodeById.get(b.house_id)!,
      flock: flockCodeById.get(b.flock_id)!,
      date: d10(b.date)!,
      n: Number(b.n),
      meanG: Number(b.mean_g),
      cvPct: Number(b.cv_pct),
      uniformityPct: Number(b.uniformity_pct),
    })),
    lab: labs.map((s) => ({
      id: s.id,
      house: houseCodeById.get(s.house_id)!,
      flock: flockCodeById.get(s.flock_id)!,
      date: d10(s.date)!,
      n: Number(s.n_eggs),
      strength: num(s.strength_kgf),
      thickness: num(s.thickness_mm),
      gravity: num(s.specific_gravity),
      haugh: num(s.haugh),
      eggWeight: num(s.egg_weight_g),
      yolkColor: num(s.yolk_color),
      notes: s.notes,
    })),
    shelfLife: shelf.map((t) => ({
      id: t.id,
      house: houseCodeById.get(t.house_id)!,
      flock: flockCodeById.get(t.flock_id)!,
      startDate: d10(t.start_date)!,
      storageTemp: Number(t.storage_temp_c),
      storageRh: Number(t.storage_rh_pct),
      schedule: t.schedule_days as number[],
      measurements: (measBy.get(t.id) ?? []).map((m) => ({
        day: Number(m.day),
        n: Number(m.n),
        haugh: Number(m.haugh_mean),
        weightLossPct: Number(m.weight_loss_pct),
        airCellMm: Number(m.air_cell_mm),
      })),
    })),
    prices: [...priceWeeks.entries()].map(([ws, p]) => ({
      weekStart: ws,
      ovo_comercial_dz: p.ovo_comercial_dz,
      ovo_trincado_dz: p.ovo_trincado_dz,
      ovo_sujo_dz: p.ovo_sujo_dz,
      racao_kg: p.racao_kg,
      ave_descarte_un: p.ave_descarte_un,
    })),
    costParams: Object.fromEntries(costs.map((c) => [c.key, Number(c.value)])),
    events,
  };
}

export { EGG_CLASSES };
