import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import type { Server } from "node:http";
import { createMockApiServer, previewAccounts, previewPassword } from "./mock-api.mjs";

let mockApi: Server;

const appointmentDate = (() => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Yerevan", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(Date.now() + 7 * 86_400_000));
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

async function setScenario(request: APIRequestContext, scenario: string) {
  const response = await request.get(`http://127.0.0.1:5100/__test__/scenario/${scenario}`);
  expect(response.ok()).toBe(true);
}

test.beforeEach(async ({ page, request }) => {
  await setScenario(request, "success");
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") await route.continue();
    else await route.abort("blockedbyclient");
  });
});

async function login(page: Page, role: keyof typeof previewAccounts = "admin", locale = "en") {
  await page.goto(`/${locale}/staff/login`);
  await page.getByLabel(locale === "en" ? "Email address" : locale === "ru" ? "Электронная почта" : "Էլ․ հասցե").fill(previewAccounts[role].email);
  await page.getByLabel(locale === "en" ? "Password" : locale === "ru" ? "Пароль" : "Գաղտնաբառ").fill(previewPassword);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/staff/?$`), { timeout: 20_000 });
}

async function openFirstAppointment(page: Page) {
  await page.goto("/en/staff/appointments");
  await expect(page.getByText("Aram Preview").filter({ visible: true }).first()).toBeVisible();
  await page.getByRole("link", { name: "View" }).first().click();
  await expect(page).toHaveURL(/\/en\/staff\/appointments\/64b000000000000000000071$/, { timeout: 30_000 });
  await expect(page.getByText("DC-PREVIEW00000001")).toBeVisible({ timeout: 30_000 });
}

test("staff login, refresh restoration, logout, and browser-only token boundaries work", async ({ page, context }) => {
  await login(page);
  await expect(page.getByRole("heading", { name: "Clinic operations" })).toBeVisible();
  const staffResponse = await page.reload();
  expect(staffResponse?.headers()["cache-control"]).toContain("must-revalidate");
  expect(staffResponse?.headers()["x-robots-tag"]).toContain("noindex");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.getByText("Preview Admin").first()).toBeVisible();

  const storage = await page.evaluate(() => ({
    local: Object.entries(localStorage), session: Object.entries(sessionStorage), hash: location.hash,
  }));
  expect(JSON.stringify(storage)).not.toContain("preview-access");
  expect(storage.hash).toBe("");
  const refreshCookie = (await context.cookies()).find((cookie) => cookie.name === "preview_refresh");
  expect(refreshCookie).toMatchObject({ httpOnly: true, sameSite: "Strict" });

  await page.getByRole("button", { name: "Sign out" }).last().click();
  await expect(page).toHaveURL(/\/en\/staff\/login$/);
  expect((await context.cookies()).some((cookie) => cookie.name === "preview_refresh")).toBe(false);
});

test("logout clears another authenticated tab and a late refresh cannot restore it", async ({ page, context, request }) => {
  await login(page);
  await expect(page.getByRole("heading", { name: "Clinic operations" })).toBeVisible();

  const secondPage = await context.newPage();
  await secondPage.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") await route.continue();
    else await route.abort("blockedbyclient");
  });
  await secondPage.goto("/en/staff");
  await expect(secondPage.getByText("Preview Admin").first()).toBeVisible();
  expect(await secondPage.evaluate(() => ({
    local: Object.entries(localStorage), session: Object.entries(sessionStorage),
  }))).toEqual({ local: [], session: [] });

  const lateAuthResponse = await request.post("http://127.0.0.1:5100/api/v1/auth/login", {
    data: { email: previewAccounts.admin.email, password: previewPassword },
  });
  expect(lateAuthResponse.ok()).toBe(true);
  const lateAuth = (await lateAuthResponse.json()).data;
  let releaseRefresh!: () => void;
  const refreshRelease = new Promise<void>((resolve) => { releaseRefresh = resolve; });
  let observeRefresh!: () => void;
  const refreshObserved = new Promise<void>((resolve) => { observeRefresh = resolve; });
  let observeRefreshFulfilled!: () => void;
  const refreshFulfilled = new Promise<void>((resolve) => { observeRefreshFulfilled = resolve; });
  await secondPage.route("**/api/v1/auth/refresh", async (route) => {
    observeRefresh();
    await refreshRelease;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: {
        "access-control-allow-origin": "http://127.0.0.1:3100",
        "access-control-allow-credentials": "true",
      },
      body: JSON.stringify({ success: true, data: lateAuth }),
    });
    observeRefreshFulfilled();
  });

  await secondPage.reload();
  await refreshObserved;
  await expect(secondPage.getByRole("status")).toContainText("Checking your secure session");

  try {
    await page.getByRole("button", { name: "Sign out" }).last().click();
    await expect(page).toHaveURL(/\/en\/staff\/login$/);
    await expect(secondPage).toHaveURL(/\/en\/staff\/login$/);
    await expect(secondPage.getByRole("heading", { name: "Sign in to the clinic workspace" })).toBeVisible();
    await expect(secondPage.getByText("Preview Admin")).toHaveCount(0);
  } finally {
    releaseRefresh();
  }

  await refreshFulfilled;
  await expect(secondPage.getByRole("heading", { name: "Sign in to the clinic workspace" })).toBeVisible();
  await secondPage.waitForTimeout(250);
  await expect(secondPage).toHaveURL(/\/en\/staff\/login$/);
  await expect(secondPage.getByText("Preview Admin")).toHaveCount(0);

  await secondPage.unroute("**/api/v1/auth/refresh");
  await secondPage.goto("/en/staff");
  await expect(secondPage).toHaveURL(/\/en\/staff\/login$/);
  await expect(secondPage.getByRole("heading", { name: "Sign in to the clinic workspace" })).toBeVisible();
});

test("HY, RU, and EN staff shells render the correct locale without overflow", async ({ page }) => {
  for (const locale of ["hy", "ru", "en"] as const) {
    await login(page, "admin", locale);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    await page.getByRole("button", { name: locale === "en" ? "Sign out" : locale === "ru" ? "Выйти" : "Դուրս գալ" }).last().click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/staff/login$`));
  }
});

test("receptionists can manage appointments while dentists are denied in UI and API", async ({ page, request }) => {
  await login(page, "receptionist");
  await expect(page.getByRole("link", { name: "Appointments" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).last().click();

  await login(page, "dentist");
  await expect(page.getByRole("link", { name: "Appointments" })).toHaveCount(0);
  await page.goto("/en/staff/appointments");
  await expect(page.getByText("Access denied")).toBeVisible();
  await expect(page.getByText("Aram Preview")).toHaveCount(0);

  const auth = await request.post("http://127.0.0.1:5100/api/v1/auth/login", {
    data: { email: previewAccounts.dentist.email, password: previewPassword },
  });
  const token = (await auth.json()).data.accessToken as string;
  const denied = await request.get("http://127.0.0.1:5100/api/v1/appointments", {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(denied.status()).toBe(403);
});

test("appointment creation and non-PII filtering use confirmed server state", async ({ page }) => {
  await login(page);
  await page.goto("/en/staff/appointments");
  await page.getByLabel("Status").selectOption("confirmed");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByText("Mariam Preview").filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("Aram Preview")).toHaveCount(0);

  await page.getByRole("button", { name: "Clear" }).click();
  await page.getByRole("button", { name: "New appointment" }).click();
  const dialog = page.getByRole("dialog");
  await page.getByLabel("Patient name").fill("Created Preview");
  await page.getByLabel("Patient phone").fill("+374 99 000099");
  await dialog.locator("select").nth(0).selectOption("64b000000000000000000011");
  await dialog.locator("select").nth(1).selectOption("64b000000000000000000021");
  await dialog.locator('input[type="date"]').fill(appointmentDate);
  await page.getByRole("button", { name: "Check availability" }).click();
  await page.getByRole("button", { name: /12:00–13:00/ }).click();
  await dialog.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create appointment" }).click();
  await expect(page.getByText("Appointment created.")).toBeVisible();
  await expect(page.getByText("Created Preview").filter({ visible: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "New appointment" }).click();
  const reopenedDialog = page.getByRole("dialog");
  await expect(reopenedDialog.locator("select").nth(0)).toHaveValue("");
  await expect(reopenedDialog.locator("select").nth(1)).toHaveValue("");
  await expect(reopenedDialog.locator('input[type="date"]')).toHaveValue("");
  await expect(reopenedDialog.getByRole("button", { name: /12:00–13:00/ })).toHaveCount(0);
  await expect(reopenedDialog.getByRole("button", { name: "Create appointment" })).toBeDisabled();
  await reopenedDialog.locator("select").nth(0).selectOption("64b000000000000000000011");
  await reopenedDialog.locator("select").nth(1).selectOption("64b000000000000000000021");
  await reopenedDialog.locator('input[type="date"]').fill(appointmentDate);
  await expect(reopenedDialog.getByRole("button", { name: /12:00–13:00/ })).toHaveCount(0);
  await expect(reopenedDialog.getByRole("button", { name: "Create appointment" })).toBeDisabled();
});

test("status, reschedule, and cancellation mutations refetch authoritative versions", async ({ page }) => {
  await login(page);
  await openFirstAppointment(page);
  await page.getByRole("button", { name: "Mark as Confirmed" }).click();
  await expect(page.getByText("Confirmed").first()).toBeVisible();

  await page.getByRole("button", { name: "Check availability" }).click();
  await page.getByRole("button", { name: "12:00–13:00" }).click();
  await page.getByLabel("Reason (optional)").fill("Preview reschedule");
  await page.getByRole("button", { name: "Confirm reschedule" }).click();
  await expect(page.getByText("12:00–13:00").first()).toBeVisible();

  await page.getByRole("button", { name: "Cancel appointment" }).click();
  await page.getByLabel("Cancellation reason").fill("Preview cancellation");
  await page.getByRole("button", { name: "Confirm cancellation" }).click();
  await expect(page.getByText("Cancelled").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel appointment" })).toHaveCount(0);
});

test("stale CAS writes and stale availability are refused without automatic mutation retry", async ({ page, request }) => {
  await login(page);
  await openFirstAppointment(page);
  await setScenario(request, "staff-conflict");
  await page.getByRole("button", { name: "Mark as Confirmed" }).click();
  await expect(page.getByText(/changed after you opened it/i)).toBeVisible();
  await expect(page.getByText("Pending").first()).toBeVisible();
  await page.getByRole("button", { name: "Mark as Confirmed" }).click();
  await expect(page.getByText("Confirmed").first()).toBeVisible();

  await setScenario(request, "staff-stale-availability");
  await page.reload();
  await page.getByRole("button", { name: "Check availability" }).click();
  await expect(page.getByText(/changed after you opened it/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "12:00–13:00" })).toHaveCount(0);
  await page.getByRole("button", { name: "Check availability" }).click();
  await expect(page.getByRole("button", { name: "12:00–13:00" })).toBeVisible();
});

test("expired refresh sessions fail closed and return to sign-in", async ({ page, request }) => {
  await login(page);
  await openFirstAppointment(page);
  await setScenario(request, "staff-expired");
  await page.reload();
  await expect(page).toHaveURL(/\/en\/staff\/login$/);
  await expect(page.getByRole("heading", { name: "Sign in to the clinic workspace" })).toBeVisible();
  await expect(page.getByText("Aram Preview")).toHaveCount(0);
});

test("forgot, reset, and setup-password fragments remain out of URLs and storage", async ({ page }) => {
  await page.goto("/en/staff/forgot-password");
  await page.getByLabel("Email address").fill("unknown@preview.local");
  await page.locator('button[type="submit"]').click();
  await expect(page.getByText(/If the account is eligible/)).toBeVisible();

  await page.goto("/en/staff/reset-password#token=invalid-reset-token-000000000000000000000000");
  await expect(page).not.toHaveURL(/token=/);
  await page.locator('input[name="password"]').fill("NewPreview1!");
  await page.locator('input[name="confirmPassword"]').fill("NewPreview1!");
  await page.locator('button[type="submit"]').click();
  await expect(page.getByText(/invalid, expired, or already used/)).toBeVisible();

  await page.goto("/en/staff/reset-password#token=preview-reset-token-000000000000000000000000");
  await expect(page).not.toHaveURL(/token=/);
  await page.locator('input[name="password"]').fill("NewPreview1!");
  await page.locator('input[name="confirmPassword"]').fill("NewPreview1!");
  await page.locator('button[type="submit"]').click();
  await expect(page.getByText(/Password saved/)).toBeVisible();

  await page.goto("/staff/setup-password#token=preview-setup-token-000000000000000000000000");
  await expect(page).toHaveURL(/\/hy\/staff\/setup-password$/);
  expect(await page.evaluate(() => ({ hash: location.hash, local: Object.entries(localStorage), session: Object.entries(sessionStorage) }))).toEqual({
    hash: "", local: [], session: [],
  });
  await expect(page.locator('input[name="password"]')).toBeVisible();
});

test("staff routes remain usable and axe-clean at representative responsive widths", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !/Failed to load resource:.*401 \(Unauthorized\)/.test(message.text())) {
      consoleErrors.push(message.text());
    }
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("link", { name: "Appointments" })).toBeVisible();
  await page.keyboard.press("Escape");

  for (const viewport of [
    { width: 375, height: 812 }, { width: 430, height: 932 }, { width: 768, height: 1024 },
    { width: 1024, height: 768 }, { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/en/staff/appointments");
    await expect(page.getByText("Aram Preview").filter({ visible: true }).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  }
  await openFirstAppointment(page);
  const results = await new AxeBuilder({ page }).disableRules(["color-contrast"]).analyze();
  expect(results.violations).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
