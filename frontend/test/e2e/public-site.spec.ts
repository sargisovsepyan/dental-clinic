import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext } from "@playwright/test";
import type { Server } from "node:http";
import { createMockApiServer } from "./mock-api.mjs";

let mockApi: Server;

test.beforeAll(async () => {
  mockApi = createMockApiServer(5100);
  await new Promise<void>((resolve, reject) => {
    mockApi.once("error", reject);
    mockApi.listen(5100, "127.0.0.1", resolve);
  });
});

test.afterAll(async () => {
  mockApi.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    mockApi.close((error) => error ? reject(error) : resolve());
  });
});

const setScenario = async (request: APIRequestContext, scenario: string) => {
  const response = await request.get(`http://127.0.0.1:5100/__test__/scenario/${scenario}`);
  expect(response.ok()).toBe(true);
};

test.beforeEach(async ({ page, request }) => {
  await setScenario(request, "success");
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") await route.continue();
    else await route.abort("blockedbyclient");
  });
});

test("public routes render in HY, RU, and EN without overflow or console faults", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  for (const locale of ["hy", "ru", "en"]) {
    for (const viewport of [
      { width: 375, height: 812 },
      { width: 430, height: 932 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(`/${locale}`);
      await expect(page.locator("h1")).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflow).toBe(false);
    }
  }
  expect(consoleErrors).toEqual([]);
});

test("all public collections and details are reachable", async ({ page }) => {
  const routes = [
    "/hy/services",
    "/hy/services/test-cleaning",
    "/ru/dentists",
    "/en/dentists/ani-test",
    "/hy/clinic",
    "/ru/gallery",
    "/en/before-after",
    "/en/before-after?page=2",
    "/hy/before-after/64b000000000000000000051",
  ];
  for (const route of routes) {
    await page.goto(route);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Internal server error");
  }

  await page.goto("/ru/gallery");
  await expect(page.getByRole("img", { name: "Фотография тестовой клиники" })).toBeVisible();

  await page.goto("/en/dentists/ani-test");
  await expect(page.getByRole("heading", { level: 1 })).toHaveAttribute("lang", "hy");

  await page.goto("/en/dentists");
  await expect(page.getByRole("heading", { level: 2, name: "Անի Փորձարկում" })).toBeVisible();

  await page.goto("/hy/before-after/64b000000000000000000051");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Փորձնական դեպք");

  await page.goto("/en/before-after?page=2");
  await expect(page.getByRole("heading", { level: 2, name: "Second test case" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Previous page" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Next page" })).toHaveCount(0);

  await page.goto("/en/clinic");
  await expect(page.locator("header.site-container > p").last()).toHaveAttribute("lang", "hy");
});

test("locale switching preserves a detail route and Armenian fallback carries lang", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/ru/services/test-cleaning");
  await page.getByRole("link", { name: "EN" }).click();
  await expect(page).toHaveURL(/\/en\/services\/test-cleaning$/);
  await expect(page.locator("h1")).toHaveAttribute("lang", "hy");
  await expect(page.locator("main > article")).toContainText('<img src=x onerror="alert(1)">');
  await expect(page.locator("main > article img")).toHaveCount(0);
});

test("mobile menu is keyboard-usable and restores focus", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/en");
  const trigger = page.getByRole("button", { name: "Open menu" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("link", { name: "Services" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("unsupported locales and missing public records return not found", async ({ page }) => {
  expect((await page.goto("/fr/services"))?.status()).toBe(404);
  await page.goto("/en/services/missing-service");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Page not found");
  await page.goto("/en/before-after?page=0");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Page not found");
});

test("SEO endpoints, metadata, and response hardening are present", async ({ page, request }) => {
  const response = await page.goto("/en/services/test-cleaning");
  expect(response?.headers()["content-security-policy"]).toContain("default-src 'self'");
  expect(response?.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response?.headers()["cross-origin-opener-policy"]).toBe("same-origin");
  await expect(page).toHaveTitle(/Ատամների մաքրում/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "http://127.0.0.1:3100/en/services/test-cleaning");
  await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(3);
  await expect(page.locator('meta[property="og:image"]')).toHaveCount(0);

  const robots = await request.get("http://127.0.0.1:3100/robots.txt");
  expect(robots.ok()).toBe(true);
  expect(await robots.text()).toContain("Sitemap: http://127.0.0.1:3100/sitemap.xml");
  const sitemap = await request.get("http://127.0.0.1:3100/sitemap.xml");
  expect(sitemap.ok()).toBe(true);
  const sitemapBody = await sitemap.text();
  expect(sitemapBody).toContain("/hy/services/test-cleaning");
  expect(sitemapBody).toContain("/en/before-after/64b000000000000000000052");
  expect(sitemapBody).toContain("/hy/book");
});

test("representative pages have no serious automated accessibility violations", async ({ page }) => {
  for (const route of ["/hy", "/ru/services", "/en/dentists/ani-test", "/hy/before-after/64b000000000000000000051"]) {
    await page.goto(route);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((item) => item.impact === "serious" || item.impact === "critical")).toEqual([]);
  }
});

test("public data routes render empty and normalized error states", async ({ page, request }) => {
  await setScenario(request, "empty");
  await page.goto("/en/services");
  await expect(page.getByText("No services are currently published.")).toBeVisible();

  await setScenario(request, "catalog-error");
  await page.goto("/en/services");
  const errorAlert = page.locator('[data-slot="alert"]');
  await expect(errorAlert).toContainText("Content is temporarily unavailable");
  await expect(errorAlert).not.toContainText("Synthetic test failure");
});
