/** Laboratório (Parte 14.9): casca e shelf life. */
import "server-only";
import { z } from "zod";
import { getSql } from "@/db/client";
import { addDays, diffDays, farmToday, weekStart } from "@/lib/dates";
import { HOUSE_COLORS } from "@/lib/colors";
import { averageCurve, controlLimits, shelfLifeDays, type HaughPoint } from "@/engine/lab";
import { linreg } from "@/engine/stats";
import { median } from "@/engine/stats";
import { PermissionError, type Scope } from "@/server/permissions";
import { ApiError } from "@/server/api";
import { getFlocks, getRefDate, currentFlockOf } from "@/server/repositories/reference";
import type { ChartSpec } from "@/components/charts/types";

const d10 = (v: unknown) => (typeof v === "string" ? v.slice(0, 10) : (v as Date).toISOString().slice(0, 10));
const n = (v: unknown) => (v == null ? null : Number(v));

export const LAB_MEASURES = [
  { key: "strength_kgf", metric: "lab.resistencia", label: "Resistência da casca", unit: "kgf", d: 2 },
  { key: "thickness_mm", metric: "lab.espessura", label: "Espessura da casca", unit: "mm", d: 3 },
  { key: "specific_gravity", metric: "lab.gravidade", label: "Gravidade específica", unit: "", d: 4 },
  { key: "haugh", metric: "lab.haugh", label: "Unidade Haugh", unit: "UH", d: 1 },
  { key: "egg_weight_g", metric: "lab.peso_ovo", label: "Peso do ovo", unit: "g", d: 1 },
  { key: "yolk_color", metric: null, label: "Cor da gema", unit: "escala", d: 1 },
] as const;

export interface LabSample {
  id: string;
  house: string;
  flock: string;
  strain: string;
  date: string;
  ageWeek: number;
  n: number | null;
  strength_kgf: number | null;
  thickness_mm: number | null;
  specific_gravity: number | null;
  haugh: number | null;
  egg_weight_g: number | null;
  yolk_color: number | null;
  notes: string | null;
}

async function loadSamples(scope: Scope): Promise<LabSample[]> {
  const sql = getSql();
  const houses = [...scope.houseCodes];
  const rows = await sql`select s.*, h.code as house, f.code as flock, st.code as strain, f.hatch_date from app.lab_samples s join app.houses h on h.id = s.house_id join app.flocks f on f.id = s.flock_id join app.strains st on st.id = f.strain_id
    where s.type = 'casca' and h.code in ${sql(houses.length ? houses : ["__"])} order by s.date desc, h.code`;
  return rows.map((r) => ({
    id: r.id,
    house: r.house,
    flock: r.flock,
    strain: r.strain,
    date: d10(r.date),
    ageWeek: Math.floor(diffDays(d10(r.hatch_date), d10(r.date)) / 7),
    n: r.n_eggs,
    strength_kgf: n(r.strength_kgf),
    thickness_mm: n(r.thickness_mm),
    specific_gravity: n(r.specific_gravity),
    haugh: n(r.haugh),
    egg_weight_g: n(r.egg_weight_g),
    yolk_color: n(r.yolk_color),
    notes: r.notes,
  }));
}

export async function getShellPage(scope: Scope, opts: { house?: string | null; from?: string | null; to?: string | null }) {
  const refDate = await getRefDate();
  const all = await loadSamples(scope);
  const houses = [...scope.houseCodes].sort();
  const house = opts.house && scope.houseCodes.has(opts.house) ? opts.house : houses[0];
  const from = opts.from ?? addDays(refDate, -182);
  const to = opts.to ?? refDate;
  const list = all.filter((s) => s.date >= from && s.date <= to && (!opts.house || s.house === house));
  const flocks = await getFlocks();
  const cur = currentFlockOf(flocks, house, refDate);

  // medidas por idade × histórico da linhagem (mediana dos outros lotes da linhagem na mesma idade)
  const byAge: ChartSpec[] = LAB_MEASURES.map((m) => {
    const mine = all.filter((s) => s.house === house && s.flock === cur?.code && s[m.key] != null);
    const hist = all.filter((s) => s.strain === cur?.strainCode && s.flock !== cur?.code && s[m.key] != null);
    const ages = Array.from(new Set(hist.map((s) => s.ageWeek))).sort((a, b) => a - b);
    return {
      kind: "age",
      title: m.label,
      unit: m.unit,
      decimals: m.d,
      xType: "value",
      xLabel: "Semana de idade",
      series: [
        ...Array.from(new Set(hist.map((s) => s.flock))).map((fl) => ({ name: fl, muted: true, type: "line" as const, width: 1, data: hist.filter((s) => s.flock === fl).sort((a, b) => a.ageWeek - b.ageWeek).map((s) => [s.ageWeek, s[m.key]] as [number, number | null]) })),
        { name: `Histórico ${cur?.strainCode ?? ""} (mediana)`, color: "#374151", dashed: true, type: "line" as const, data: ages.map((a) => [a, median(hist.filter((s) => s.ageWeek === a).map((s) => s[m.key]))] as [number, number | null]) },
        { name: `${cur?.code ?? house} (atual)`, color: HOUSE_COLORS[house], type: "line" as const, symbol: true, width: 2.5, data: mine.sort((a, b) => a.ageWeek - b.ageWeek).map((s) => [s.ageWeek, s[m.key]] as [number, number | null]) },
      ],
      height: 220,
    } satisfies ChartSpec;
  });

  // resistência × trincados do contador na mesma semana (todas as amostras visíveis nas últimas 52 semanas)
  const sql = getSql();
  const recent = all.filter((s) => s.date >= addDays(refDate, -364) && s.strength_kgf != null);
  const wk = await sql`select h.code as house, m.week_start, m.value from app.weekly_metrics m join app.houses h on h.id = m.house_id
    where m.metric_code = 'qual.trincados' and m.week_start >= ${weekStart(addDays(refDate, -364))} and h.code in ${sql(houses)}`;
  const crackedBy = new Map(wk.map((r) => [`${r.house}|${d10(r.week_start)}`, Number(r.value)]));
  const pts = recent.map((s) => ({ s, y: crackedBy.get(`${s.house}|${weekStart(s.date)}`) ?? null })).filter((x) => x.y != null);
  const reg = linreg(pts.map((p) => p.s.strength_kgf), pts.map((p) => p.y));
  const xs = pts.map((p) => p.s.strength_kgf!);
  const scatter: ChartSpec = {
    kind: "scatter",
    title: "Resistência da casca × trincados do contador na mesma semana",
    unit: "%",
    decimals: 2,
    xType: "value",
    xLabel: "Resistência (kgf)",
    series: [
      ...houses.map((h) => ({ name: h, color: HOUSE_COLORS[h], type: "scatter" as const, data: pts.filter((p) => p.s.house === h).map((p) => [p.s.strength_kgf!, p.y] as [number, number | null]) })),
      ...(reg && xs.length ? [{ name: `Tendência (R² ${reg.r2.toFixed(2).replace(".", ",")})`, color: "#111827", dashed: true, type: "line" as const, data: [Math.min(...xs), Math.max(...xs)].map((x) => [x, reg.a + reg.b * x] as [number, number | null]) }] : []),
    ],
    height: 300,
  };

  // gráfico de controle da resistência (galpão escolhido, lote atual)
  // últimas 26 amostras do lote atual (≈ 6 meses), para não confundir a queda natural com a idade com perda de controle
  const ctrlPts = all.filter((s) => s.house === house && s.flock === cur?.code && s.strength_kgf != null).sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-26);
  const lim = controlLimits(ctrlPts.map((s) => s.strength_kgf!));
  const out = lim ? ctrlPts.filter((s) => s.strength_kgf! < lim.lcl || s.strength_kgf! > lim.ucl) : [];
  const control: ChartSpec = {
    kind: "control",
    title: `Gráfico de controle — resistência da casca (${house}, ${cur?.code ?? ""})`,
    unit: "kgf",
    decimals: 2,
    xType: "time",
    series: [
      { name: "Resistência", color: HOUSE_COLORS[house], type: "line", symbol: true, data: ctrlPts.map((s) => [s.date, s.strength_kgf] as [string, number | null]) },
      ...(out.length ? [{ name: "Fora dos limites", color: "#dc2626", type: "scatter" as const, data: out.map((s) => [s.date, s.strength_kgf] as [string, number | null]) }] : []),
    ],
    refLines: lim ? [{ name: `Média ${lim.center.toFixed(2).replace(".", ",")}`, y: lim.center, color: "#374151" }, { name: `LSC ${lim.ucl.toFixed(2).replace(".", ",")}`, y: lim.ucl, dashed: true, color: "#dc2626" }, { name: `LIC ${lim.lcl.toFixed(2).replace(".", ",")}`, y: lim.lcl, dashed: true, color: "#dc2626" }] : [],
    height: 260,
  };
  return { house, houses, from, to, list, cur: cur ? { code: cur.code, strain: cur.strainCode } : null, byAge, scatter, control, limits: lim, outCount: out.length, regression: reg };
}

// ------------------------------------------------------------------------------------------------
// shelf life
// ------------------------------------------------------------------------------------------------
export async function getHaughLimit(): Promise<number> {
  const sql = getSql();
  const [r] = await sql`select value from app.system_state where key = 'lab_config'`;
  return Number((r?.value as { haughLimit?: number } | undefined)?.haughLimit ?? 60);
}

export async function setHaughLimit(scope: Scope, v: number) {
  if (!scope.canConfigure) throw new PermissionError("Somente diretoria e gerência mudam o limite.");
  const sql = getSql();
  await sql`insert into app.system_state (key, value) values ('lab_config', ${JSON.stringify({ haughLimit: v })}::jsonb) on conflict (key) do update set value = excluded.value, updated_at = now()`;
}

export async function getShelfLifePage(scope: Scope, testId?: string | null) {
  const sql = getSql();
  const houses = [...scope.houseCodes];
  const limit = await getHaughLimit();
  const today = farmToday();
  const tests = await sql`select t.id, h.code as house, f.code as flock, st.code as strain, t.start_date, t.storage_temp_c, t.storage_rh_pct, t.schedule_days
    from app.shelf_life_tests t join app.houses h on h.id = t.house_id join app.flocks f on f.id = t.flock_id join app.strains st on st.id = f.strain_id
    where h.code in ${sql(houses.length ? houses : ["__"])} order by t.start_date desc`;
  const ms = tests.length ? await sql`select test_id, day, n, haugh_mean, weight_loss_pct, air_cell_mm from app.shelf_life_measurements where test_id in ${sql(tests.map((t) => t.id))} order by day` : [];
  const items = tests.map((t) => {
    const pts: HaughPoint[] = ms.filter((m) => m.test_id === t.id && m.haugh_mean != null).map((m) => ({ day: Number(m.day), haugh: Number(m.haugh_mean) }));
    const sched = (t.schedule_days as number[]) ?? [];
    const start = d10(t.start_date);
    const done = new Set(ms.filter((m) => m.test_id === t.id).map((m) => Number(m.day)));
    const pending = sched.filter((dd) => !done.has(dd)).map((dd) => ({ day: dd, date: addDays(start, dd) }));
    const finished = pending.length === 0;
    return {
      id: t.id as string,
      house: t.house as string,
      flock: t.flock as string,
      strain: t.strain as string,
      start,
      condition: `${n(t.storage_temp_c) ?? "—"} °C${t.storage_rh_pct != null ? ` · ${Number(t.storage_rh_pct)}% UR` : ""}`,
      status: finished ? "concluído" : "em andamento",
      pending,
      points: pts,
      estimate: shelfLifeDays(pts, limit),
      measurements: ms.filter((m) => m.test_id === t.id).map((m) => ({ day: Number(m.day), n: m.n, haugh: n(m.haugh_mean), weightLoss: n(m.weight_loss_pct), airCell: n(m.air_cell_mm) })),
    };
  });
  const sel = items.find((x) => x.id === testId) ?? items[0] ?? null;
  let chart: ChartSpec | null = null;
  let strainAvg: { days: number | null; n: number } | null = null;
  if (sel) {
    const others = items.filter((x) => x.strain === sel.strain && x.id !== sel.id && x.points.length >= 3);
    const avg = averageCurve(others.map((o) => o.points));
    const est = shelfLifeDays(avg, limit);
    strainAvg = { days: est.days, n: others.length };
    chart = {
      kind: "shelf",
      title: `Unidade Haugh por dia de armazenamento — ${sel.house}, início ${sel.start.split("-").reverse().join("/")}`,
      unit: "UH",
      decimals: 1,
      xType: "value",
      xLabel: "Dias de armazenamento",
      series: [
        ...others.slice(0, 12).map((o) => ({ name: `${o.house} ${o.start.slice(5).split("-").reverse().join("/")}`, muted: true, type: "line" as const, width: 1, data: o.points.map((p) => [p.day, p.haugh] as [number, number | null]) })),
        { name: `Média dos testes ${sel.strain} (${others.length})`, color: "#374151", dashed: true, type: "line" as const, data: avg.map((p) => [p.day, p.haugh] as [number, number | null]) },
        { name: `Teste ${sel.house} (${sel.flock})`, color: HOUSE_COLORS[sel.house], type: "line" as const, symbol: true, width: 2.5, data: sel.points.map((p) => [p.day, p.haugh] as [number, number | null]) },
      ],
      refLines: [{ name: `Limite ${limit} UH`, y: limit, dashed: true, color: "#dc2626" }],
      height: 320,
    };
  }
  const dueToday = items.flatMap((t) => t.pending.filter((p) => p.date === today).map((p) => ({ test: t, ...p })));
  const upcoming = items.flatMap((t) => t.pending.filter((p) => p.date > today && p.date <= addDays(today, 3)).map((p) => ({ test: t, ...p })));
  const overdue = items.flatMap((t) => t.pending.filter((p) => p.date < today).map((p) => ({ test: t, ...p })));
  return { limit, items, sel, chart, strainAvg, dueToday, upcoming, overdue, today };
}

// ------------------------------------------------------------------------------------------------
// escrita
// ------------------------------------------------------------------------------------------------
const Num = (lo: number, hi: number) => z.number().min(lo).max(hi).nullish();
export const ShellSampleInput = z.object({
  house: z.string().regex(/^P\d{3}$/),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  n: z.number().int().min(1).max(500),
  strength: Num(1, 7),
  thickness: Num(0.2, 0.6),
  gravity: Num(1.05, 1.11),
  haugh: Num(30, 110),
  weight: Num(35, 85),
  yolk: Num(1, 16),
  notes: z.string().max(500).nullish(),
});

/** Grava a amostra e atualiza os indicadores de laboratório (última amostra vale por 7 dias). */
export async function createShellSample(scope: Scope, i: z.infer<typeof ShellSampleInput>) {
  if (!scope.houseCodes.has(i.house)) throw new PermissionError(`Sem acesso a ${i.house}.`);
  const refDate = await getRefDate();
  if (i.date > farmToday()) throw new ApiError(400, "A data da amostra não pode ser no futuro.");
  const flocks = await getFlocks();
  const f = currentFlockOf(flocks, i.house, i.date);
  if (!f) throw new ApiError(400, `Não há lote alojado no ${i.house} em ${i.date.split("-").reverse().join("/")}.`);
  const sql = getSql();
  const [row] = await sql`insert into app.lab_samples (tenant_id, house_id, flock_id, date, type, n_eggs, strength_kgf, thickness_mm, specific_gravity, haugh, egg_weight_g, yolk_color, notes)
    select tenant_id, ${f.houseId}, ${f.id}, ${i.date}, 'casca', ${i.n}, ${i.strength ?? null}, ${i.thickness ?? null}, ${i.gravity ?? null}, ${i.haugh ?? null}, ${i.weight ?? null}, ${i.yolk ?? null}, ${i.notes ?? null} from app.farms limit 1 returning id`;
  // indicadores diários lab.* do dia da amostra até 6 dias depois (ou a data de referência) e semanais ("último")
  const end = addDays(i.date, 6) < refDate ? addDays(i.date, 6) : refDate;
  const vals: Array<[string, number | null | undefined]> = [["lab.resistencia", i.strength], ["lab.espessura", i.thickness], ["lab.gravidade", i.gravity], ["lab.haugh", i.haugh], ["lab.peso_ovo", i.weight]];
  if (i.date <= refDate) {
    for (const [code, v] of vals) {
      if (v == null) continue;
      await sql`insert into app.daily_metrics (tenant_id, house_id, flock_id, date, age_days, age_week, phase, metric_code, value, numerator, denominator, quality_flag, computed_at)
        select tenant_id, house_id, flock_id, date, age_days, age_week, phase, ${code}, ${v}, null, null, 0, now() from app.daily_metrics
        where house_id = ${f.houseId} and metric_code = 'prod.postura' and date between ${i.date} and ${end}
        on conflict (house_id, date, metric_code) do update set value = excluded.value, computed_at = now()`;
      for (let w = weekStart(i.date); w <= weekStart(end); w = addDays(w, 7)) {
        await sql`update app.weekly_metrics m set value = d.value, computed_at = now() from (
            select value from app.daily_metrics where house_id = ${f.houseId} and metric_code = ${code} and date between ${w} and ${addDays(w, 6)} order by date desc limit 1) d
          where m.house_id = ${f.houseId} and m.metric_code = ${code} and m.week_start = ${w}`;
      }
    }
  }
  return row.id as string;
}

export const ShelfTestInput = z.object({
  house: z.string().regex(/^P\d{3}$/),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  temp: z.number().min(0).max(40),
  rh: z.number().min(10).max(100).nullish(),
});

export async function createShelfTest(scope: Scope, i: z.infer<typeof ShelfTestInput>) {
  if (!scope.houseCodes.has(i.house)) throw new PermissionError(`Sem acesso a ${i.house}.`);
  const f = currentFlockOf(await getFlocks(), i.house, i.start);
  if (!f) throw new ApiError(400, `Não há lote alojado no ${i.house} nessa data.`);
  const sql = getSql();
  const [row] = await sql`insert into app.shelf_life_tests (tenant_id, house_id, flock_id, start_date, storage_temp_c, storage_rh_pct, schedule_days)
    select tenant_id, ${f.houseId}, ${f.id}, ${i.start}, ${i.temp}, ${i.rh ?? null}, ${"{0,7,14,21,28}"}::int[] from app.farms limit 1 returning id`;
  return row.id as string;
}

export const ShelfMeasureInput = z.object({ day: z.number().int().min(0).max(60), n: z.number().int().min(1).max(200), haugh: z.number().min(20).max(110), weightLoss: Num(0, 20), airCell: Num(0, 20) });

export async function addShelfMeasurement(scope: Scope, testId: string, i: z.infer<typeof ShelfMeasureInput>) {
  const sql = getSql();
  const [t] = await sql`select h.code from app.shelf_life_tests t join app.houses h on h.id = t.house_id where t.id = ${testId}`;
  if (!t) throw new ApiError(404, "Teste não encontrado.");
  if (!scope.houseCodes.has(t.code)) throw new PermissionError(`Sem acesso a ${t.code}.`);
  const [dup] = await sql`select id from app.shelf_life_measurements where test_id = ${testId} and day = ${i.day}`;
  if (dup) throw new ApiError(409, `O dia ${i.day} já foi medido neste teste.`);
  const [row] = await sql`insert into app.shelf_life_measurements (test_id, day, n, haugh_mean, weight_loss_pct, air_cell_mm) values (${testId}, ${i.day}, ${i.n}, ${i.haugh}, ${i.weightLoss ?? null}, ${i.airCell ?? null}) returning id`;
  return row.id as string;
}
