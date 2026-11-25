/**
 * Roteiro de 20 minutos (Parte 21) executado de ponta a ponta: cada passo confere o que precisa aparecer.
 * Ao final, desfaz as alterações (resposta do S8, decisões e cenário ao vivo) com o botão Limpar e a API.
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

test("roteiro da demonstração, passos 1 a 11", async ({ page, browser }) => {
  test.setTimeout(300_000);
  await login(page, "diretor@demo.local");

  // 1. Início
  await page.goto("/");
  await expect(page.getByText(/Previsão de calor/).first()).toBeVisible();
  await expect(page.getByText(/pista 2 do P007/).first()).toBeVisible();
  await expect(page.getByText(/Sujos de fezes do P004/).first()).toBeVisible();
  await expect(page.getByText(/Margem negativa do P007/).first()).toBeVisible();
  await expect(page.getByText(/Briefing/i).first()).toBeVisible();

  // 2. Granja
  await page.goto("/granja");
  await expect(page.getByText("P007").first()).toBeVisible();

  // 3. Ficha do P005 com a faixa da onda de calor
  await page.goto("/galpoes/P005");
  await expect(page.getByText(/Últimos 60 dias/)).toBeVisible();
  await expect(page.locator("svg text", { hasText: "Onda de calor" }).first()).toBeVisible();

  // 4. Alerta do P005 (S1)
  await page.goto("/alertas?aba=resolvidos&galpao=P005");
  await page.getByRole("link", { name: /Postura do P005 caiu/ }).first().click();
  await expect(page.getByText(/Estresse térmico/).first()).toBeVisible();
  await expect(page.getByText(/Resfriamento insuficiente/).first()).toBeVisible();
  await expect(page.getByText(/calor explica/i).first()).toBeVisible();
  await expect(page.getByText(/2024/).first()).toBeVisible();

  // 5. Evento da bronquite no P003 (S2)
  await page.goto("/eventos?galpao=P003");
  await page.getByRole("link", { name: /Bronquite infecciosa/ }).first().click();
  await expect(page.getByText(/perda estimada/i).first()).toBeVisible();
  await expect(page.getByText(/controle/i).first()).toBeVisible();

  // 6. Alerta do P007 (S5)
  await page.goto("/alertas");
  await page.getByRole("link", { name: /Avarias na pista 2 do P007/ }).first().click();
  await expect(page.getByText(/Equipamento de coleta/).first()).toBeVisible();
  await expect(page.getByText(/27\/06\/2026/).first()).toBeVisible();

  // 7. P004 (S8) no campo como encarregado
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const field = await ctx.newPage();
  await login(field, "encarregado@demo.local");
  await field.goto("/campo/P004");
  await field.getByRole("button", { name: "Vazamento de bebedouro" }).click();
  await expect(field.getByText(/Registrado|Obrigado|resposta/i).first()).toBeVisible();
  await ctx.close();
  await page.goto("/alertas");
  await page.getByRole("link", { name: /Sujos de fezes do P004/ }).first().click();
  await expect(page.getByText(/Vazamento de bebedouro/).first()).toBeVisible();
  await expect(page.getByText(/alta/i).first()).toBeVisible();

  // 8. Assistente
  await page.goto("/assistente");
  await page.getByRole("button", { name: "Vale manter o L107 por mais 8 semanas?" }).click();
  await expect(page.getByText(/Semana recomendada de descarte/)).toBeVisible();
  await expect(page.getByText(/amortização da franga/)).toBeVisible();

  // 9. Relatório Semanal e modo reunião
  await page.goto("/relatorios");
  const href = (await page.locator("a[href^='/relatorios/semanal/']").first().getAttribute("href"))!;
  const week = href.split("/").pop()!;
  await page.goto(href);
  await expect(page.locator(".report-page")).toHaveCount(11);
  await page.goto(`/reuniao/${week}`);
  await expect(page.getByText("Decisões da reunião anterior")).toBeVisible();
  await expect(page.getByText(/Revisar exaustores e nebulização do P005/)).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText("2 / 12")).toBeVisible();

  // 10. Financeiro e simulador
  await page.goto("/financeiro");
  await expect(page.getByText(/Estimado/i).first()).toBeVisible();
  await page.goto("/financeiro?aba=simulador");
  await expect(page.getByText(/vermelho|negativ/i).first()).toBeVisible();

  // 11. Demonstração ao vivo (a falha de bebedouro precisa de 3 h de dados: antes das 08h usamos o pico de temperatura)
  await page.goto("/demo");
  const hour = Number(new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Fortaleza", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
  await page.getByRole("button", { name: "P004", exact: true }).click();
  const action = hour >= 8 ? "Falha de bebedouro agora" : "Pico de temperatura agora";
  await page.locator("div", { hasText: action }).getByRole("button", { name: /Rodar no P004/ }).last().click();
  await expect(page.getByText(hour >= 8 ? /A08h/ : /A11/).first()).toBeVisible({ timeout: 15_000 });
  await page.goto("/galpoes/P004");
  await expect(page.getByText("Hoje (parcial, ao vivo)")).toBeVisible();

  // limpeza
  const r = await page.request.post("/api/demo/limpar");
  expect(r.ok()).toBe(true);
});
