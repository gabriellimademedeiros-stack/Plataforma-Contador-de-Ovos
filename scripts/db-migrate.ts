import "./env";
import { runMigrations } from "./lib/migrate";

runMigrations()
  .then(() => console.log("✓ Migrações aplicadas"))
  .catch((e) => {
    console.error("✗ Falha nas migrações:", e);
    process.exit(1);
  });
