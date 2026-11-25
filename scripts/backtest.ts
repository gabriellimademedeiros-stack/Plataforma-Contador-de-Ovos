import "./env";
import { resolveCalendar } from "../src/simulator/calendar";
import { generateDataset } from "../src/simulator/generate";
import { calibrateFinance } from "../src/simulator/calibrate";
import { computeAllMetrics } from "../src/engine/metrics/pipeline";
import { detectionTable, runBacktest } from "./lib/alerts-step";

/** demo:backtest — roda o motor de alertas em memória sobre todo o histórico e imprime a tabela de detecção. */
const cal = resolveCalendar();
const t0 = Date.now();
const calib = calibrateFinance(cal.seed, cal.dEnd);
const ds = generateDataset({ seed: cal.seed, dEnd: cal.dEnd, skipHourly: true, calibEgg: calib.calibEgg, qualityOffset: { L107: calib.l107 } });
const m = computeAllMetrics(ds);
const w = runBacktest(ds, m);
const months = 35;
const matched = new Set<string>();
for (const r of detectionTable(w)) console.log(`${r.ok ? "✓" : "✗"} ${r.code.padEnd(3)} ${r.name.padEnd(44)} ${r.result} ${r.rules}`);
for (const s of w.scenarios) for (const a of w.alerts) if ((a.house == null || s.houses.includes(a.house)) && a.firstDeviationOn >= s.start && a.firstDeviationOn <= s.end) matched.add(a.id);
const noise = w.alerts.filter((a) => !matched.has(a.id) && a.rule !== "P01");
console.log(`Ruído (alertas fora dos cenários): ${noise.length} → ${(noise.length / 8 / months).toFixed(2)} por galpão por mês (meta ≤ 3)`);
console.log(`Concluído em ${((Date.now() - t0) / 1000).toFixed(1)} s`);
