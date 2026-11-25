import "./env";
import { createScriptDb } from "../src/db/client";
import { loadDataset } from "../src/server/repositories/dataset-loader";
import { computeAndWriteMetrics } from "./lib/metrics-step";

/** demo:compute — recalcula os passos 6 a 9 a partir dos dados brutos do banco. */
async function main() {
  const { sql } = createScriptDb(5);
  try {
    const t0 = Date.now();
    const ds = await loadDataset(sql);
    console.log(`Dados carregados (${ds.dStart} → ${ds.dEnd}) em ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    await computeAndWriteMetrics(sql, ds);
    console.log(`✓ Concluído em ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  } finally {
    await sql.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
