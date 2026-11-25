import { NextResponse } from "next/server";
import { z } from "zod";
import { withScope } from "@/server/api";
import { audit } from "@/server/audit";
import { getRefDate } from "@/server/repositories/reference";
import { lastCompleteWeekStart, weekStart } from "@/lib/dates";
import { generateRun } from "@/server/services/reports/runs";

export const maxDuration = 60;

const Body = z.object({ tipo: z.enum(["semanal", "comparativo", "ambos"]).default("ambos"), semana: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish() });

/** "Gerar agora": gera e arquiva os relatórios da última semana completa (ou da semana informada). */
export const POST = withScope(async (scope, req: Request) => {
  if (!scope.canConfigure) return NextResponse.json({ error: "Somente diretoria e gerência geram relatórios." }, { status: 403 });
  const b = Body.parse(await req.json().catch(() => ({})));
  const ref = await getRefDate();
  const ws = b.semana ? weekStart(b.semana) : lastCompleteWeekStart(ref);
  if (ws > lastCompleteWeekStart(ref)) return NextResponse.json({ error: "A semana ainda não terminou." }, { status: 400 });
  const kinds = b.tipo === "ambos" ? (["semanal", "comparativo"] as const) : ([b.tipo] as const);
  const ids: string[] = [];
  for (const k of kinds) ids.push((await generateRun(k, ws)).id);
  await audit(scope.user.id, "gerar", "report_runs", ids[0] ?? null, null, { semana: ws, tipos: kinds, ids });
  return NextResponse.json({ ok: true, semana: ws, ids });
});
