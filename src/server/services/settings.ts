/** Configurações (Parte 14.20): metas, regras (com prévia de 90 dias), memória da empresa, custos e usuários. */
import "server-only";
import { z } from "zod";
import { getSql } from "@/db/client";
import { addDays } from "@/lib/dates";
import { TENANT_ID } from "@/lib/ids";
import { computeAllMetrics } from "@/engine/metrics/pipeline";
import { buildRuleContext, defaultParams } from "@/engine/alerts/context";
import { backtest } from "@/engine/alerts/engine";
import { RULE_BY_CODE } from "@/engine/alerts/rules";
import { PermissionError, type Scope } from "@/server/permissions";
import { ApiError } from "@/server/api";
import { audit } from "@/server/audit";
import { getRefDate } from "@/server/repositories/reference";
import { loadDataset, loadInternalStandards, loadStrainStandards } from "@/server/repositories/dataset-loader";

export function assertConfig(scope: Scope) {
  if (!scope.canConfigure) throw new PermissionError("Seu perfil não altera configurações.");
}

export async function listRules() {
  const sql = getSql();
  const rows = await sql`select code, name_pt, description_pt, anomaly_type, severity_default, params, active, version, kind from app.alert_rules order by code`;
  return rows.map((r) => ({ code: r.code as string, name: r.name_pt as string, description: r.description_pt as string, severity: r.severity_default as string, params: r.params as Record<string, number>, defaults: RULE_BY_CODE[r.code]?.params ?? {}, active: r.active as boolean, version: Number(r.version), kind: r.kind as string }));
}

/** Contexto de 90 dias em memória, reaproveitado pelas prévias da mesma requisição. */
async function previewContext() {
  const sql = getSql();
  const ref = await getRefDate();
  const from = addDays(ref, -89 - 42);
  const [ds, strainRows, internalRows] = await Promise.all([loadDataset(sql, { from, to: ref }), loadStrainStandards(sql), loadInternalStandards(sql)]);
  const m = computeAllMetrics(ds, { strainRows, internalRows, from, to: ref });
  return { ds, m, ref };
}

/** "Teria disparado N vezes nos últimos 90 dias": backtest em memória com os parâmetros propostos e com os atuais. */
export async function previewRule(code: string, params: Record<string, number>) {
  const def = RULE_BY_CODE[code];
  if (!def) throw new ApiError(400, "Regra desconhecida.");
  if (def.kind === "tempo_real" || def.kind === "preventiva") return { code, applicable: false, proposed: null, current: null, houses: {}, message: def.kind === "tempo_real" ? "Regra de tempo real: é avaliada só no dia corrente, com dados horários e por minuto." : "Regra preventiva: depende da previsão do tempo de cada dia." };
  const t0 = Date.now();
  const sql = getSql();
  const cur = (await sql`select params from app.alert_rules where code = ${code}`)[0]?.params ?? def.params;
  const { ds, m, ref } = await previewContext();
  const run = (p: Record<string, number>) => {
    const all = defaultParams();
    all[code] = { ...all[code], ...p };
    const ctx = buildRuleContext(ds, m, all);
    return backtest(ctx, addDays(ref, -89), ref).alerts.filter((a) => a.rule === code);
  };
  const proposed = run(params);
  const current = run(cur as Record<string, number>);
  const houses: Record<string, number> = {};
  for (const a of proposed) houses[a.house ?? "granja"] = (houses[a.house ?? "granja"] ?? 0) + 1;
  return { code, applicable: true, proposed: proposed.length, current: current.length, houses, period: { from: addDays(ref, -89), to: ref }, ms: Date.now() - t0, message: null };
}

export const RuleUpdate = z.object({ code: z.string(), params: z.record(z.string(), z.number()).optional(), active: z.boolean().optional() });

export async function updateRule(scope: Scope, u: z.infer<typeof RuleUpdate>) {
  assertConfig(scope);
  const def = RULE_BY_CODE[u.code];
  if (!def) throw new ApiError(400, "Regra desconhecida.");
  const sql = getSql();
  const [before] = await sql`select params, active, version from app.alert_rules where code = ${u.code}`;
  const params = u.params ? Object.fromEntries(Object.entries(u.params).filter(([k]) => k in def.params)) : before.params;
  for (const [k, v] of Object.entries(params as Record<string, number>)) if (!Number.isFinite(v) || v < 0) throw new ApiError(400, `Valor inválido para ${k}.`);
  await sql`update app.alert_rules set params = ${JSON.stringify(params)}::jsonb, active = ${u.active ?? before.active}, version = version + 1 where code = ${u.code}`;
  await audit(scope.user.id, "alterar", "alert_rules", null, { code: u.code, ...before }, { code: u.code, params, active: u.active ?? before.active });
}

export const TargetUpdate = z.object({ id: z.string().uuid(), greenMin: z.number().nullable(), greenMax: z.number().nullable(), yellowMin: z.number().nullable(), yellowMax: z.number().nullable() });

export async function updateTarget(scope: Scope, t: z.infer<typeof TargetUpdate>) {
  assertConfig(scope);
  if ((t.greenMin == null) === (t.greenMax == null)) throw new ApiError(400, "Informe a meta verde mínima (maior é melhor) ou máxima (menor é melhor).");
  if (t.greenMin != null && t.yellowMin != null && t.yellowMin > t.greenMin) throw new ApiError(400, "O limite amarelo precisa ser menor ou igual ao verde.");
  if (t.greenMax != null && t.yellowMax != null && t.yellowMax < t.greenMax) throw new ApiError(400, "O limite amarelo precisa ser maior ou igual ao verde.");
  const sql = getSql();
  const [before] = await sql`select * from app.targets where id = ${t.id}`;
  if (!before) throw new ApiError(404, "Meta não encontrada.");
  await sql`update app.targets set green_min = ${t.greenMin}, green_max = ${t.greenMax}, yellow_min = ${t.yellowMin}, yellow_max = ${t.yellowMax} where id = ${t.id}`;
  await audit(scope.user.id, "alterar", "targets", t.id, before, t);
}

export async function listTargetsRaw() {
  const sql = getSql();
  return sql`select id, metric_code, phase, green_min, green_max, yellow_min, yellow_max from app.targets order by metric_code, phase nulls first`;
}

export const CostUpdate = z.object({ key: z.string(), value: z.number().min(0).max(1_000_000) });

export async function updateCost(scope: Scope, c: z.infer<typeof CostUpdate>) {
  assertConfig(scope);
  const sql = getSql();
  const [before] = await sql`select * from app.cost_params where key = ${c.key}`;
  if (!before) throw new ApiError(404, "Parâmetro não encontrado.");
  await sql`update app.cost_params set value = ${c.value} where key = ${c.key}`;
  await audit(scope.user.id, "alterar", "cost_params", null, before, c);
}

export async function addMemory(scope: Scope, text: string) {
  assertConfig(scope);
  const sql = getSql();
  const [row] = await sql`insert into app.company_memory (tenant_id, text, created_by) values (${TENANT_ID}, ${text}, ${scope.user.id}) returning id`;
  await audit(scope.user.id, "criar", "company_memory", row.id, null, { text });
  return row.id as string;
}

export async function setMemoryActive(scope: Scope, id: string, active: boolean) {
  assertConfig(scope);
  const sql = getSql();
  const [before] = await sql`select * from app.company_memory where id = ${id}`;
  if (!before) throw new ApiError(404, "Item não encontrado.");
  await sql`update app.company_memory set active = ${active} where id = ${id}`;
  await audit(scope.user.id, "alterar", "company_memory", id, before, { active });
}
