/**
 * Passo 11 do reset: gera e arquiva (report_runs) o Relatório Semanal e o Comparativo das últimas semanas completas.
 * Usa os mesmos serviços das telas (exige o script rodar com --conditions=react-server).
 */
import type { Sql } from "postgres";
import { addDays, lastCompleteWeekStart } from "@/lib/dates";

export async function generateReportsForWeeks(sql: Sql, dEnd: string, weeks: number) {
  await sql`truncate app.report_runs`;
  const { generateRun } = await import("@/server/services/reports/runs");
  const last = lastCompleteWeekStart(dEnd);
  for (let k = weeks - 1; k >= 0; k--) {
    const ws = addDays(last, -7 * k);
    for (const kind of ["semanal", "comparativo"] as const) {
      await generateRun(kind, ws);
      console.log(`    relatório ${kind} da semana ${ws} arquivado`);
    }
  }
}
