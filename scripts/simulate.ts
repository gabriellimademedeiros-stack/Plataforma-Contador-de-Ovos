import "./env";
import { resolveCalendar } from "../src/simulator/calendar";
import { generateDataset } from "../src/simulator/generate";

const cal = resolveCalendar();
const t0 = Date.now();
const ds = generateDataset({ seed: cal.seed, dEnd: cal.dEnd });
const ms = Date.now() - t0;
const eggRows = ds.eggDaily.length * 12;
const hourlyRows = ds.eggHourly.length * 6;
console.log(`Simulação em memória: ${(ms / 1000).toFixed(1)} s (D_start ${ds.dStart} → D_end ${ds.dEnd})`);
console.table({
  lotes: ds.flocks.length,
  daily_records: ds.daily.length,
  egg_counts_diarios: eggRows,
  egg_counts_horarios: hourlyRows,
  daily_env: ds.env.length,
  sensor_readings: ds.sensors.length,
  pesagens: ds.bodyWeights.length,
  laboratorio: ds.lab.length,
  shelf_life: ds.shelfLife.length,
  cargas_racao: ds.feedBatches.length,
  semanas_preco: ds.prices.length,
  eventos: ds.events.length,
  previsao: ds.forecast.length,
});
for (const f of ds.flocks) console.log(f.code, f.houseCode, f.strainCode, f.hatchDate, f.startDate, f.endDate ?? "ativo", f.qualityOffset);
