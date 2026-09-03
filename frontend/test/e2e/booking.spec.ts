import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import type { Server } from "node:http";
import { createMockApiServer } from "./mock-api.mjs";

let mockApi: Server;

const bookingDate = (() => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Yerevan",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000));
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
})();

test.beforeAll(async () => {
  mockApi = createMockApiServer(5100);
  await new Promise<void>((resolve, reject) => {
    mockApi.once("error", reject);
    mockApi.listen(5100, "127.0.0.1", resolve);
  });
});

test.afterAll(async () => {
  mockApi.closeAllConnections();
  await new Promise<void>((resolve, reject) => mockApi.close((error) => error ? reject(error) : resolve()));
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

async function reachForm(page: Page, date = bookingDate, time = "09:00") {
  await page.getByRole("button", { name: /Ատամների մաքրում/ }).click();
  await page.getByRole("button", { name: /Անի Փորձարկում/ }).click();
  await page.getByLabel("Visit date").fill(date);
  await page.getByRole("button", { name: `Choose ${time}` }).click();
}

async function fillForm(page: Page) {
  await page.getByLabel(/Full name/).fill("Test Patient");
  await page.getByLabel(/Phone number/).fill("+374 99 123456");
  await page.getByLabel(/Email address/).fill("patient@example.test");
  await page.getByLabel(/Comment/).fill("Please call first");
  await page.getByRole("checkbox").check();
}

async function submitLocalizedBooking(page: Page, locale: "hy" | "ru", keyboard = false) {
  await page.goto(`/${locale}/book`);
  const service = page.getByRole("button", { name: locale === "ru" ? /Чистка зубов/ : /Ատամների մաքրում/ });
  const dentist = page.getByRole("button", { name: /Անի Փորձարկում/ });
  if (keyboard) {
    await service.focus();
    await page.keyboard.press("Enter");
    await dentist.focus();
    await page.keyboard.press("Space");
  } else {
    await service.click();
    await dentist.click();
  }
  await page.locator('input[name="date"]').fill(bookingDate);
  const slot = page.getByRole("button", { name: /09:00/ });
  if (keyboard) {
    await slot.focus();
    await page.keyboard.press("Enter");
  } else await slot.click();
  await page.locator('input[name="patientName"]').fill("Test Patient");
  await page.locator('input[name="patientPhone"]').fill("+374 99 123456");
  await page.locator('input[name="patientEmail"]').fill("patient@example.test");
  await page.getByRole("checkbox").check();
  await page.locator('button[type="submit"]').click();
}

test("booking entry points are live and locale switching preserves only safe preselection", async ({ page }) => {
  await page.goto("/en");
  await expect(page.getByRole("link", { name: "Book a visit" }).first()).toHaveAttribute("href", "/en/book");

  await page.goto("/en/services/test-cleaning");
  await page.locator("main").getByRole("link", { name: "Book a visit" }).click();
  await expect(page).toHaveURL(/\/en\/book\?service=test-cleaning$/);
  await expect(page.getByRole("button", { name: /Ատամների մաքրում/ })).toHaveAttribute("aria-pressed", "true");

  await page.goto("/en/dentists/ani-test");
  await page.locator("main").getByRole("link", { name: "Book a visit" }).click();
  await expect(page).toHaveURL(/\/en\/book\?dentist=ani-test$/);
  await page.getByRole("link", { name: "RU" }).click();
  await expect(page).toHaveURL(/\/ru\/book\?dentist=ani-test$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Выберите");
});

test("pending and confirmed submissions render only the safe authoritative result", async ({ page, request }) => {
  await page.goto("/en/book");
  await reachForm(page);
  await fillForm(page);
  await expect(page).not.toHaveURL(/Test|374|patient/i);
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
  await page.getByRole("button", { name: "Send booking request" }).click();
  await expect(page.getByRole("heading", { name: "Request received" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByTestId("confirmation-code")).toHaveText("DC-0123456789ABCDEF");
  await expect(page.locator("main")).not.toContainText("+374 99 123456");
  await expect(page.locator("main")).not.toContainText("patient@example.test");
  await expect(page.locator("main")).not.toContainText("64b000000000000000000071");

  await setScenario(request, "confirmed");
  await page.goto("/en/book");
  await reachForm(page);
  await fillForm(page);
  await page.getByRole("button", { name: "Send booking request" }).click();
  await expect(page.getByRole("heading", { name: "Visit confirmed" })).toBeVisible();
});

test("HY mobile and RU keyboard bookings submit the route locale and localized result", async ({ page }) => {
  const submittedLocales: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "POST" || !request.url().endsWith("/api/v1/appointments")) return;
    submittedLocales.push((request.postDataJSON() as { locale?: string }).locale || "");
  });

  await page.setViewportSize({ width: 375, height: 812 });
  await submitLocalizedBooking(page, "hy");
  await expect(page.getByRole("heading", { name: "Հարցումն ընդունված է" })).toBeVisible();
  await expect(page.getByText("Ատամների մաքրում")).toBeVisible();

  await page.setViewportSize({ width: 768, height: 1024 });
  await submitLocalizedBooking(page, "ru", true);
  await expect(page.getByRole("heading", { name: "Заявка принята" })).toBeVisible();
  await expect(page.getByText("Чистка зубов")).toBeVisible();
  expect(submittedLocales).toEqual(["hy", "ru"]);
});

test("network uncertainty retries with the same key and double submission stays single", async ({ page }) => {
  const keys: string[] = [];
  let abortFirst = true;
  await page.route("**/api/v1/appointments", async (route) => {
    keys.push(route.request().headers()["idempotency-key"] || "");
    if (abortFirst) {
      abortFirst = false;
      await route.abort("connectionfailed");
    } else await route.continue();
  });
  await page.goto("/en/book");
  await reachForm(page);
  await fillForm(page);
  await page.getByRole("button", { name: "Send booking request" }).click();
  await expect(page.getByText(/could not confirm whether/)).toBeVisible();
  await page.getByRole("button", { name: "Send booking request" }).click();
  await expect(page.getByRole("heading", { name: "Request received" })).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
});

test("a 409 clears and refreshes only the slot while preserving patient details", async ({ page, request }) => {
  await setScenario(request, "conflict");
  await page.goto("/en/book");
  await reachForm(page);
  await fillForm(page);
  await page.getByRole("button", { name: "Send booking request" }).click();
  await expect(page.getByText(/just taken/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose 09:00" })).toHaveCount(0);
  await page.getByRole("button", { name: "Choose 10:30" }).click();
  await expect(page.getByLabel(/Full name/)).toHaveValue("Test Patient");
  await expect(page.getByLabel(/Phone number/)).toHaveValue("+374 99 123456");
  await expect(page.getByLabel(/Email address/)).toHaveValue("patient@example.test");
  await expect(page.getByRole("checkbox")).toBeChecked();
});

test("empty, validation, rate-limit, and service failures stay actionable and normalized", async ({ page, request }) => {
  await setScenario(request, "empty-availability");
  await page.goto("/en/book");
  await page.getByRole("button", { name: /Ատամների մաքրում/ }).click();
  await page.getByRole("button", { name: /Անի Փորձարկում/ }).click();
  await page.getByLabel("Visit date").fill(bookingDate);
  await expect(page.getByText(/No times are available/)).toBeVisible();

  for (const [scenario, expected] of [
    ["validation", /Check the details/],
    ["rate-limit", /too many attempts/],
    ["error", /temporarily unavailable/],
  ] as const) {
    await setScenario(request, scenario);
    await page.goto("/en/book");
    await reachForm(page);
    await fillForm(page);
    await page.getByRole("button", { name: "Send booking request" }).click();
    await expect(page.getByText(expected)).toBeVisible();
    await expect(page.locator("main")).not.toContainText("Synthetic");
  }
});

test("the full form has no serious accessibility issues or horizontal overflow at required widths", async ({ page }) => {
  for (const viewport of [
    { width: 375, height: 812 },
    { width: 430, height: 932 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/en/book");
    await reachForm(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  }
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((item) => item.impact === "serious" || item.impact === "critical")).toEqual([]);
});

test("disabled test mode never loads Turnstile and the CSP does not allow it", async ({ page }) => {
  const external: string[] = [];
  page.on("request", (request) => {
    const host = new URL(request.url()).hostname;
    if (host !== "127.0.0.1" && host !== "localhost") external.push(request.url());
  });
  const response = await page.goto("/hy/book");
  expect(response?.headers()["content-security-policy"]).not.toContain("challenges.cloudflare.com");
  await expect(page.locator('script[src*="challenges.cloudflare.com"]')).toHaveCount(0);
  expect(external).toEqual([]);
});
