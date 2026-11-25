/**
 * Ponta a ponta (Parte 18.6): login dos 3 perfis; todas as rotas abrem sem erro no console; alerta do S5;
 * pergunta sugerida no modo reserva; impressão do Relatório Semanal com 11 páginas; campo no celular.
 */
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const PASSWORD = process.env.DEMO_PASSWORD ?? (readFileSync(".env.local", "utf8").match(/^DEMO_PASSWORD=(.*)$/m)?.[1] ?? "");

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("response", (r) => {
    if (r.status() === 404 && !/favicon/.test(r.url())) errors.push(`404: ${r.url()}`);
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error" && !/favicon|Download the React DevTools|Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  return errors;
}

async function lastWeek(page: Page): Promise<string> {
  await page.goto("/relatorios");
  const href = await page.locator("a[href^='/relatorios/semanal/']").first().getAttribute("href");
  return href!.split("/").pop()!;
}

test("diretor: todas as rotas abrem sem erro no console", async ({ page }) => {
  const errors = watchErrors(page);
  await login(page, "diretor@demo.local");
  const week = await lastWeek(page);
  await page.goto("/eventos");
  const ev = await page.locator("a[href^='/eventos/']:not([href='/eventos/novo'])").first().getAttribute("href");
  await page.goto("/alertas");
  const al = await page.locator("a[href^='/alertas/']").first().getAttribute("href");
  const routes = ["/", "/granja", "/galpoes/P005", "/galpoes/P005?aba=producao", "/galpoes/P007?aba=qualidade", "/galpoes/P003?aba=sanidade", "/galpoes/P005?aba=nutricao", "/galpoes/P005?aba=ambiencia", "/galpoes/P007?aba=financeiro", "/galpoes/P002?aba=eventos", "/galpoes/P001?aba=dispositivos", "/producao", "/qualidade", "/laboratorio", "/laboratorio?aba=shelf", "/sanidade", "/nutricao", "/ambiencia", "/financeiro", "/financeiro?aba=simulador", "/financeiro?aba=descarte", "/eventos", "/eventos/novo", ev!, "/alertas", al!, "/comparativos", "/relatorios", `/relatorios/semanal/${week}`, `/relatorios/comparativo/${week}`, "/assistente", "/dispositivos", "/configuracoes", "/configuracoes?aba=regras", "/configuracoes?aba=usuarios", "/campo", "/campo/P004", "/demo", "/demo/validacao", "/demo/contador-ao-vivo", `/reuniao/${week}`];
  for (const r of routes) {
    const res = await page.goto(r, { waitUntil: "networkidle" });
    expect(res?.status(), r).toBeLessThan(400);
    await expect(page.getByText("Dados simulados").first(), r).toBeVisible();
  }
  expect(errors, errors.join("\n")).toEqual([]);
});

test("gerente: vê finanças, não vê o painel de demonstração nem usuários", async ({ page }) => {
  await login(page, "gerente@demo.local");
  await page.goto("/financeiro");
  await expect(page.getByRole("heading", { name: /Financeiro/ })).toBeVisible();
  await page.goto("/demo");
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/configuracoes");
  await expect(page.getByRole("link", { name: "Usuários" })).toHaveCount(0);
});

test("encarregado: só P001 a P004 e nada financeiro", async ({ page }) => {
  const errors = watchErrors(page);
  await login(page, "encarregado@demo.local");
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Financeiro" })).toHaveCount(0);
  await page.goto("/galpoes/P005");
  await expect(page.getByText(/não (tem acesso|pode ver)|sem acesso/i).first()).toBeVisible();
  for (const r of ["/granja", "/galpoes/P002", "/alertas", "/campo", "/campo/P004", "/relatorios", "/assistente", "/configuracoes"]) {
    const res = await page.goto(r, { waitUntil: "networkidle" });
    expect(res?.status(), r).toBeLessThan(400);
  }
  const fin = await page.request.get("/api/metricas?metrica=fin.margem");
  expect(fin.status()).toBe(403);
  expect(errors, errors.join("\n")).toEqual([]);
});

test("alerta do S5: equipamento de coleta em 1º e caso H6", async ({ page }) => {
  await login(page, "diretor@demo.local");
  await page.goto("/alertas");
  await page.getByRole("link", { name: /Avarias na pista 2 do P007/ }).first().click();
  await expect(page.getByText(/Equipamento de coleta/).first()).toBeVisible();
  await expect(page.getByText(/P001/).first()).toBeVisible();
});

test("assistente: pergunta sugerida no modo reserva", async ({ page }) => {
  await login(page, "diretor@demo.local");
  await page.goto("/assistente");
  await page.getByRole("button", { name: "Qual galpão teve mais trincados na última semana?" }).click();
  await expect(page.getByText("Modo demonstração sem IA").first()).toBeVisible();
  await expect(page.getByText(/teve o maior valor de trincados/)).toBeVisible();
  await page.getByRole("button", { name: /Como calculei/ }).click();
  await expect(page.getByText("consultar_indicador")).toBeVisible();
});

test("impressão do Relatório Semanal desenha 11 páginas", async ({ page }) => {
  await login(page, "diretor@demo.local");
  const week = await lastWeek(page);
  await page.goto(`/relatorios/semanal/${week}/imprimir`, { waitUntil: "networkidle" });
  await expect(page.locator(".report-page")).toHaveCount(11);
  await expect(page.getByText("Desenhando gráficos")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByText("Dados simulados · página 11 de 11")).toBeVisible();
});

test("campo no celular: registra mortalidade e mostra Registrado ✓", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await login(page, "encarregado@demo.local");
  await page.goto("/campo/P002");
  await page.getByRole("button", { name: "Mortalidade" }).click();
  await page.getByLabel("Quantas aves?").fill("3");
  await page.getByRole("button", { name: "Registrar" }).click();
  await expect(page.getByText(/Registrado ✓/)).toBeVisible();
  // limpa o apontamento de teste
  await page.request.post("/api/demo/limpar").catch(() => null);
  await ctx.close();
});
