import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

/**
 * Testes de ponta a ponta (Parte 18.6). Usam o servidor local (npm run dev) com a demonstração carregada.
 * `E2E_BASE_URL` permite rodar contra o link publicado.
 */
const chromium = "/opt/pw-browsers/chromium";
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    viewport: { width: 1440, height: 1000 },
    trace: "off",
    launchOptions: existsSync(chromium) ? { executablePath: chromium } : {},
  },
  webServer: process.env.E2E_BASE_URL ? undefined : { command: "npm run dev", url: "http://localhost:3000/login", reuseExistingServer: true, timeout: 120_000 },
});
