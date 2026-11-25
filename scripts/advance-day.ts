/**
 * npm run demo:advance-day — gera os dias que faltam até ontem (máximo 3 por execução), como o cron da Vercel.
 * Opção --ate=AAAA-MM-DD simula a execução como se hoje fosse o dia seguinte à data (para testes locais).
 */
import "./env";
import { advanceDays } from "@/server/services/advance";
import { getSql } from "@/db/client";
import { addDays, farmInstant } from "@/lib/dates";

(async () => {
  const arg = process.argv.find((a) => a.startsWith("--ate="));
  const now = arg ? farmInstant(addDays(arg.slice(6), 1), 7) : new Date();
  const r = await advanceDays({ now, trigger: "script" });
  console.log(r.message);
  if (r.alerts.length) console.log(`Alertas novos: ${r.alerts.map((a) => `${a.rule} ${a.house ?? "granja"}`).join(", ")}`);
  if (r.reports.length) console.log(`Relatórios gerados: ${r.reports.join(", ")}`);
  console.log(`Duração: ${(r.ms / 1000).toFixed(1)} s`);
  await getSql().end({ timeout: 2 });
  process.exit(0);
})().catch(async (e) => {
  console.error("Falhou:", e.message);
  process.exit(1);
});
