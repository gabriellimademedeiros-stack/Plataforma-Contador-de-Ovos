/**
 * Avanço diário (Parte 19.4): gera os dias que faltam até ontem (no máximo 3 por chamada) com os mesmos modelos
 * do simulador, mantendo a âncora D_end original (os cenários em andamento continuam), recalcula indicadores,
 * regras, retratos de eventos com janela aberta e hipóteses, gera os relatórios ao fechar a semana e registra
 * a execução em job_runs.
 */
import "server-only";
import { getSql } from "@/db/client";
import { addDays, currentProductiveDate, dayOfWeek, farmInstant, weekStart } from "@/lib/dates";
import { TENANT_ID, houseIdFor } from "@/lib/ids";
import { generateDataset } from "@/simulator/generate";
import { dailyRecordRows, eggCountRows, envRows, eventRows, sensorRows } from "@/server/repositories/dataset-writer";
import { insertRows } from "@/server/repositories/bulk-insert";
import { uuidFromName } from "@/lib/ids";
import { recomputeHouseDay } from "./recompute";
import { recomputeOpenImpacts } from "./events";
import { recomputeOpenAlertInsights } from "./alert-insights";
import { generateRun } from "./reports/runs";

interface SimState {
  seed: number;
  dStart: string;
  anchorEnd: string;
  lastDay: string;
  calibEgg: number[];
  l107: number;
}

export interface AdvanceResult {
  generated: string[];
  remaining: number;
  alerts: Array<{ id: string; rule: string; house: string | null; title: string }>;
  reports: string[];
  ms: number;
  message: string;
}

export async function getSimState(): Promise<SimState | null> {
  const sql = getSql();
  const [r] = await sql`select value from app.system_state where key = 'simulation'`;
  return (r?.value as SimState) ?? null;
}

export async function advanceDays(opts: { now?: Date; maxDays?: number; trigger?: string } = {}): Promise<AdvanceResult> {
  const t0 = Date.now();
  const now = opts.now ?? new Date();
  const sql = getSql();
  const st = await getSimState();
  if (!st) throw new Error("Estado da simulação não encontrado: rode o reset da demonstração primeiro.");
  const target = addDays(currentProductiveDate(now), -1);
  const missing: string[] = [];
  for (let d = addDays(st.lastDay, 1); d <= target; d = addDays(d, 1)) missing.push(d);
  const days = missing.slice(0, opts.maxDays ?? 3);
  if (!days.length) return { generated: [], remaining: 0, alerts: [], reports: [], ms: Date.now() - t0, message: "Nada a fazer: os dados já estão em dia." };

  const [job] = await sql`insert into app.job_runs (tenant_id, job, started_at, ok, summary) values (${TENANT_ID}, 'avancar-dia', now(), false, ${JSON.stringify({ dias: days, origem: opts.trigger ?? "cron" })}::jsonb) returning id`;
  try {
    const first = days[0];
    const last = days[days.length - 1];
    // 1. dados ao vivo de dias já encerrados saem; apontamentos do campo desses dias são guardados para mesclar
    const closedBefore = farmInstant(currentProductiveDate(now), 6).toISOString();
    await sql`delete from app.sensor_readings where source = 'ao_vivo' and ts < ${closedBefore}`;
    await sql`delete from app.egg_counts where source = 'ao_vivo' and date < ${currentProductiveDate(now)}`;
    const field = await sql`select h.code as house, d.date::text as date, d.deaths, d.deaths_by_cause, d.feed_kg, d.water_l from app.daily_records d join app.houses h on h.id = d.house_id
      where d.source = 'campo' and d.date between ${first} and ${last}`;
    await sql`delete from app.daily_records where source = 'campo' and date between ${first} and ${last}`;

    // 2. gera os dias novos com os mesmos modelos (âncora fixa = mesmos dados para a mesma semente e D_end)
    const ds = generateDataset({ seed: st.seed, dEnd: st.anchorEnd, dStart: st.dStart, to: last, emitFrom: first, qualityOffset: { L107: st.l107 }, calibEgg: st.calibEgg });
    const fieldBy = new Map(field.map((f) => [`${f.house}|${f.date}`, f]));
    const codeById = new Map(ds.houses.map((h) => [houseIdFor(h.code), h.code]));
    const daily = dailyRecordRows(ds)
      .filter((r) => (r.date as string) >= first)
      .map((r) => {
        const f = fieldBy.get(`${codeById.get(r.house_id as string) ?? ""}|${r.date}`);
        if (!f) return r;
        // o apontamento do campo vale mais que o simulado para o que foi registrado
        return { ...r, deaths: Math.max(Number(r.deaths), Number(f.deaths)), deaths_by_cause: Number(f.deaths) > Number(r.deaths) ? f.deaths_by_cause : r.deaths_by_cause, feed_kg: f.feed_kg ?? r.feed_kg, water_l: f.water_l ?? r.water_l, source: "campo" };
      });
    await sql`delete from app.sensor_readings where source = 'simulado' and ts >= ${farmInstant(first, 6).toISOString()} and ts < ${farmInstant(addDays(last, 1), 6).toISOString()}`;
    const counts: Record<string, number> = {};
    counts.daily_records = await insertRows(sql, "daily_records", daily);
    counts.egg_counts = await insertRows(sql, "egg_counts", eggCountRows(ds).filter((r) => (r.date as string) >= first));
    counts.daily_env = await insertRows(sql, "daily_env", envRows(ds).filter((r) => (r.date as string) >= first));
    counts.sensor_readings = await insertRows(sql, "sensor_readings", sensorRows(ds));
    await sql`delete from app.weather_forecast where date > ${last}`;
    counts.weather_forecast = await insertRows(sql, "weather_forecast", ds.forecast.map((f) => ({ farm_id: ds.farm.id, date: f.date, temp_max: f.tempMax, temp_min: f.tempMin, generated_on: f.generatedOn })));
    counts.body_weight_samples = await insertRows(sql, "body_weight_samples", ds.bodyWeights.filter((b) => b.date >= first).map((b) => ({ id: uuidFromName(`bw:${b.house}:${b.date}`), house_id: houseIdFor(b.house), flock_id: uuidFromName(`flock:${b.flock}`), date: b.date, n: b.n, mean_g: b.meanG, cv_pct: b.cvPct, uniformity_pct: b.uniformityPct })));
    counts.lab_samples = await insertRows(sql, "lab_samples", ds.lab.filter((s) => s.date >= first).map((s) => ({ id: s.id, tenant_id: TENANT_ID, house_id: houseIdFor(s.house), flock_id: uuidFromName(`flock:${s.flock}`), date: s.date, type: "casca", n_eggs: s.n, strength_kgf: s.strength, thickness_mm: s.thickness, specific_gravity: s.gravity, haugh: s.haugh, egg_weight_g: s.eggWeight, yolk_color: s.yolkColor, notes: s.notes ?? null })));
    counts.shelf_life_tests = await insertRows(sql, "shelf_life_tests", ds.shelfLife.filter((t) => t.startDate >= first).map((t) => ({ id: t.id, tenant_id: TENANT_ID, house_id: houseIdFor(t.house), flock_id: uuidFromName(`flock:${t.flock}`), start_date: t.startDate, storage_temp_c: t.storageTemp, storage_rh_pct: t.storageRh, schedule_days: t.schedule })));
    counts.shelf_life_measurements = await insertRows(sql, "shelf_life_measurements", ds.shelfLife.flatMap((t) => t.measurements.filter((m) => addDays(t.startDate, m.day) >= first && addDays(t.startDate, m.day) <= last).map((m) => ({ id: uuidFromName(`slm:${t.id}:${m.day}`), test_id: t.id, day: m.day, n: m.n, haugh_mean: m.haugh, weight_loss_pct: m.weightLossPct, air_cell_mm: m.airCellMm }))));
    counts.prices = await insertRows(sql, "prices", ds.prices.filter((p) => p.weekStart >= weekStart(first)).flatMap((p) => (["ovo_comercial_dz", "ovo_trincado_dz", "ovo_sujo_dz", "racao_kg", "ave_descarte_un"] as const).map((item) => ({ tenant_id: TENANT_ID, week_start: p.weekStart, item, value_brl: p[item] }))));
    counts.feed_batches = await insertRows(sql, "feed_batches", ds.feedBatches.filter((b) => b.deliveredOn >= first).map((b) => ({ id: b.id, tenant_id: TENANT_ID, code: b.code, delivered_on: b.deliveredOn, supplier: b.supplier, formulation: b.formulation, house_ids: b.houses.map(houseIdFor), price_per_kg: b.pricePerKg, calcium_pct_spec: b.calciumSpec, lab_note: null })));
    const newEvents = ds.events.filter((e) => e.startDate >= first);
    if (newEvents.length) {
      const er = eventRows(newEvents);
      counts.events = await insertRows(sql, "events", er.ev);
      await insertRows(sql, "event_scopes", er.scopes);
      await insertRows(sql, "event_certainty_history", er.history);
    }

    // 3. indicadores e regras, dia a dia (P01 com a previsão do último dia)
    const alerts: AdvanceResult["alerts"] = [];
    for (const d of days) {
      const r = await recomputeHouseDay("P001", d, { now, writeAllHouses: true, forecastDay: d === last });
      alerts.push(...r.opened);
    }
    await sql`update app.system_state set value = ${JSON.stringify({ ...st, lastDay: last })}::jsonb, updated_at = now() where key = 'simulation'`;

    // 4. retratos com janela aberta e hipóteses dos alertas abertos
    await recomputeOpenImpacts();
    await recomputeOpenAlertInsights();

    // 5. relatórios da semana que fechou (sábado gerado)
    const reports: string[] = [];
    for (const d of days) {
      if (dayOfWeek(d) === 6) {
        const ws = weekStart(d);
        for (const k of ["semanal", "comparativo"] as const) {
          await generateRun(k, ws);
          reports.push(`${k} ${ws}`);
        }
      }
    }
    const result: AdvanceResult = { generated: days, remaining: missing.length - days.length, alerts, reports, ms: Date.now() - t0, message: `Gerado(s) ${days.length} dia(s): ${days.map((d) => d.split("-").reverse().join("/")).join(", ")}.${missing.length > days.length ? ` Faltam ${missing.length - days.length} dia(s); chame de novo.` : ""}` };
    await sql`update app.job_runs set finished_at = now(), ok = true, summary = ${JSON.stringify({ ...result, linhas: counts, origem: opts.trigger ?? "cron" })}::jsonb where id = ${job.id}`;
    return result;
  } catch (e) {
    await sql`update app.job_runs set finished_at = now(), ok = false, summary = ${JSON.stringify({ erro: (e as Error).message, dias: days })}::jsonb where id = ${job.id}`;
    throw e;
  }
}

export async function recentJobRuns(limit = 10) {
  const sql = getSql();
  const rows = await sql`select id, job, started_at, finished_at, ok, summary from app.job_runs order by started_at desc limit ${limit}`;
  return rows.map((r) => ({ id: r.id as string, job: r.job as string, startedAt: new Date(r.started_at).toISOString(), finishedAt: r.finished_at ? new Date(r.finished_at).toISOString() : null, ok: r.ok as boolean, summary: r.summary as Record<string, unknown> }));
}
