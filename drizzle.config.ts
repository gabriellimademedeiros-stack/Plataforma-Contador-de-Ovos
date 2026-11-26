import { normalizeDbUrl } from "./src/db/url";
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local", quiet: true });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  schemaFilter: ["app"],
  dbCredentials: { url: normalizeDbUrl(process.env.DIRECT_URL ?? process.env.DATABASE_URL).url ?? "" },
});
