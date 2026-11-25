/**
 * Arquivo de relatórios (Parte 15.3): ao gerar, grava em report_runs o retrato dos números usados.
 * Se os dados da semana mudarem depois (computed_at em daily_metrics), marca data_changed_after sem reescrever o retrato.
 */
import "server-only";
import { getSql } from "@/db/client";
import { addDays } from "@/lib/dates";
import { scopeForUser, type Scope } from "@/server/permissions";
import { getHouses } from "@/server/repositories/reference";
import type { ReportModel } from "@/components/reports/types";
import { buildWeeklyReport } from "./weekly";
import { buildComparativeReport } from "./comparative";

export type ReportKind = "semanal" | "comparativo";

/** Escopo da granja inteira (diretoria) usado para o arquivo. */
export async function farmScope(): Promise<Scope> {
  const sql = getSql();
  const [u] = await sql`select id, email, name, role, allowed_house_ids from app.users where role = 'diretor' and active order by created_at limit 1`;
  return scopeForUser({ id: u.id, email: u.email, name: u.name, role: "diretor", allowedHouseIds: null }, await getHouses());
}

export function buildReport(kind: ReportKind, scope: Scope, ws: string, note: string | null = null): Promise<ReportModel> {
  return kind === "semanal" ? buildWeeklyReport(scope, ws, note) : buildComparativeReport(scope, ws, note);
}

export async function generateRun(kind: ReportKind, ws: string): Promise<{ id: string; model: ReportModel }> {
  const model = await buildReport(kind, await farmScope(), ws);
  const sql = getSql();
  const [r] = await sql`insert into app.report_runs (tenant_id, type, week_start, generated_at, snapshot, data_changed_after)
    select tenant_id, ${kind}, ${ws}, ${model.generatedAt}, ${JSON.stringify(model)}::jsonb, false from app.farms limit 1 returning id`;
  return { id: r.id, model };
}

export interface RunInfo {
  id: string;
  kind: ReportKind;
  weekStart: string;
  generatedAt: string;
  dataChangedAfter: boolean;
}

const d10 = (v: unknown) => (typeof v === "string" ? v.slice(0, 10) : (v as Date).toISOString().slice(0, 10));

/** Confere se algum dado da semana foi recalculado depois da geração e grava a marca. */
async function refreshChanged(rows: Array<{ id: string; week_start: unknown; generated_at: unknown; data_changed_after: boolean }>) {
  const sql = getSql();
  for (const r of rows) {
    if (r.data_changed_after) continue;
    const ws = d10(r.week_start);
    const [m] = await sql`select max(computed_at) as t from app.daily_metrics where date between ${ws} and ${addDays(ws, 6)}`;
    if (m?.t && new Date(m.t).getTime() > new Date(r.generated_at as string).getTime() + 1000) {
      await sql`update app.report_runs set data_changed_after = true where id = ${r.id}`;
      r.data_changed_after = true;
    }
  }
}

export async function listRuns(): Promise<RunInfo[]> {
  const sql = getSql();
  const rows = await sql`select distinct on (type, week_start) id, type, week_start, generated_at, data_changed_after from app.report_runs order by type, week_start, generated_at desc`;
  await refreshChanged(rows as never);
  return rows
    .map((r) => ({ id: r.id, kind: r.type as ReportKind, weekStart: d10(r.week_start), generatedAt: new Date(r.generated_at).toISOString(), dataChangedAfter: r.data_changed_after }))
    .sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1));
}

export async function latestRun(kind: ReportKind, ws: string): Promise<{ info: RunInfo; model: ReportModel } | null> {
  const sql = getSql();
  const [r] = await sql`select id, type, week_start, generated_at, data_changed_after, snapshot from app.report_runs where type = ${kind} and week_start = ${ws} order by generated_at desc limit 1`;
  if (!r) return null;
  await refreshChanged([r as never]);
  return { info: { id: r.id, kind, weekStart: ws, generatedAt: new Date(r.generated_at).toISOString(), dataChangedAfter: r.data_changed_after }, model: r.snapshot as ReportModel };
}

/**
 * Relatório para exibir: o arquivado (retrato) para quem vê a granja inteira; para perfis com escopo limitado
 * (encarregado), uma versão montada na hora só com os galpões e dados permitidos.
 */
export async function reportForViewer(kind: ReportKind, scope: Scope, ws: string): Promise<{ model: ReportModel; info: RunInfo | null; live: boolean }> {
  const limited = !scope.allHouses || !scope.canSeeFinance;
  if (limited) {
    const note = `Versão do seu perfil: ${[...scope.houseCodes].sort().join(", ")}${scope.canSeeFinance ? "" : ", sem dados financeiros"}.`;
    return { model: await buildReport(kind, scope, ws, note), info: null, live: true };
  }
  const run = await latestRun(kind, ws);
  if (run) return { model: run.model, info: run.info, live: false };
  return { model: await buildReport(kind, scope, ws), info: null, live: true };
}
