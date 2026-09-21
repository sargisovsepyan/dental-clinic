import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import type { Server } from "node:http";
import { createMockApiServer, previewAccounts, previewPassword } from "./mock-api.mjs";
import { staffGovernanceMessages } from "../../src/i18n/staff-governance-messages";
import { staffMessages } from "../../src/i18n/staff-messages";
let api: Server;
const apiUrl = "http://127.0.0.1:5100";
async function login(page: Page, account: keyof typeof previewAccounts = "admin", locale = "en") {
  await page.goto(`/${locale}/staff/login`);
  await page.locator('input[type="email"]').fill(previewAccounts[account].email);
  await page.locator('input[type="password"]').fill(previewPassword);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(
    new RegExp(`/${locale}/staff${account === "dentist" ? "/my-appointments" : ""}/?$`),
  );
}
test.beforeAll(async () => {
  api = createMockApiServer();
  await new Promise<void>((resolve, reject) => { api.once("error", reject); api.listen(5100, "127.0.0.1", resolve); });
});
test.afterAll(async () => { api.closeAllConnections(); await new Promise<void>((resolve) => api.close(() => resolve())); });
test.beforeEach(async ({ context, request }) => {
  await request.get(`${apiUrl}/__test__/scenario/success`);
  await context.route("**/*", async (route) => {
    const host = new URL(route.request().url()).hostname;
    if (["127.0.0.1", "localhost"].includes(host)) await route.continue(); else await route.abort("blockedbyclient");
  });
});
const card = (page: Page, id: string) => page.getByTestId(`staff-${id}`);
async function invite(page: Page, name: string, email: string) {
  await page.locator("#main-content").getByRole("button", { name: "Invite staff" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Staff name").fill(name);
  await dialog.getByLabel("Email address").fill(email);
  await dialog.getByRole("button", { name: "Invite staff" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

test("team invitation/filtering has exact bodies, privacy, conflicts, and uncertain commit recovery", async ({ page, request }) => {
  const external: string[] = [];
  page.on("request", (req) => { if (!["127.0.0.1", "localhost"].includes(new URL(req.url()).hostname)) external.push(req.url()); });
  await login(page); await page.goto("/en/staff/team");
  await expect(card(page, previewAccounts.secondAdmin.id)).toBeVisible();
  await page.getByLabel("Role").selectOption("receptionist");
  await page.getByLabel("Status", { exact: true }).selectOption("pending");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByText("Pending Setup", { exact: true })).toBeVisible();
  await expect(page.getByText("Preview Dentist", { exact: true })).toHaveCount(0);
  await expect(card(page, "64b000000000000000000096").getByRole("button", { name: "Reactivate staff" })).toHaveCount(0);
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  const body = page.waitForRequest((req) => req.url().endsWith("/staff/invite") && req.method() === "POST");
  await invite(page, "New Staff", "new@preview.local");
  expect((await body).postDataJSON()).toEqual({ name: "New Staff", email: "new@preview.local", role: "receptionist" });
  await expect(page.getByText(/Invitation sent to new@preview.local/)).toBeVisible();
  await page.getByLabel("Status", { exact: true }).selectOption("pending");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByText("New Staff", { exact: true })).toBeVisible();
  await invite(page, "Existing", previewAccounts.admin.email);
  await expect(page.getByText(/established staff account already uses/)).toBeVisible();
  await request.get(`${apiUrl}/__test__/scenario/staff-invite-uncertain`);
  let calls = 0; page.on("request", (req) => { if (req.url().endsWith("/staff/invite") && req.method() === "POST") calls++; });
  await invite(page, "Uncertain Staff", "uncertain@preview.local");
  await expect(page.getByText(/Invitation outcome is uncertain/)).toBeVisible();
  await expect(page.getByText("Uncertain Staff", { exact: true })).toBeVisible(); expect(calls).toBe(1);
  expect(await page.evaluate(() => ({ local: Object.entries(localStorage), session: Object.entries(sessionStorage), hash: location.hash, search: location.search }))).toEqual({ local: [], session: [], hash: "", search: "" });
  expect(external).toEqual([]);
});

test("role/lifecycle controls, detail, last-admin conflict, and 403 preserve authority", async ({ page, request }) => {
  await login(page); await page.goto("/en/staff/team");
  const self = card(page, previewAccounts.admin.id);
  await expect(self.getByRole("button", { name: "Change role" })).toBeDisabled();
  await expect(self.getByRole("button", { name: "Deactivate staff" })).toBeDisabled();
  const dentist = card(page, previewAccounts.dentist.id);
  await dentist.getByRole("button", { name: "View" }).click();
  await page.getByRole('dialog').getByText('Staff ID', { exact: true }).click();
  await expect(page.getByRole("dialog").getByText(previewAccounts.dentist.id)).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  await dentist.getByRole("button", { name: "Change role" }).click();
  await page.getByRole("dialog").getByLabel("Role").selectOption("receptionist");
  await page.getByRole("dialog").getByRole("button", { name: "Confirm change" }).click();
  await expect(dentist).toContainText("Receptionist");
  await dentist.getByRole("button", { name: "Deactivate staff" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirm change" }).click();
  await expect(dentist).toHaveCount(0);
  await page.getByLabel('Status', { exact: true }).selectOption('deactivated');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(dentist.getByText("Deactivated", { exact: true })).toBeVisible();
  await dentist.getByRole("button", { name: "Restore employee" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirm change" }).click();
  await expect(dentist).toHaveCount(0);
  await page.getByLabel('Status', { exact: true }).selectOption('active');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(dentist.getByText("Active", { exact: true })).toBeVisible();
  await request.get(`${apiUrl}/__test__/scenario/staff-last-admin-conflict`);
  await card(page, previewAccounts.secondAdmin.id).getByRole("button", { name: "Deactivate staff" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirm change" }).click();
  await expect(page.getByText(/protect self-access or the last active administrator/)).toBeVisible();
  await request.get(`${apiUrl}/__test__/scenario/governance-forbidden`);
  await card(page, previewAccounts.dentist.id).getByRole("button", { name: "Revoke all sessions" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirm change" }).click();
  await expect(page.getByText("You do not have permission for this action.").first()).toBeVisible();
  await expect(page.getByText("Preview Admin").first()).toBeVisible();
  await page.goto("/en/staff/account"); await expect(page.getByRole("heading", { name: "Account security" })).toBeVisible();
});

test("self revoke ends this browser and other tabs without a protected team refetch", async ({ page, context }) => {
  await login(page); await page.goto("/en/staff/team");
  const second = await context.newPage(); await second.goto("/en/staff/account");
  await expect(second.getByRole("heading", { name: "Account security" })).toBeVisible();
  await card(page, previewAccounts.admin.id).getByRole("button", { name: "Revoke all sessions" }).click();
  await expect(page.getByRole("dialog").getByText(/includes your current session/)).toBeVisible();
  const reads: string[] = [];
  page.on("request", (req) => { if (req.method() === "GET" && /\/api\/v1\/staff(?:\?|\/|$)/u.test(req.url())) reads.push(req.url()); });
  await page.getByRole("dialog").getByRole("button", { name: "Confirm change" }).click();
  await expect(page).toHaveURL(/\/en\/staff\/login$/);
  await expect(second).toHaveURL(/\/en\/staff\/login$/); expect(reads).toEqual([]);
});

test("audit uses server filtering, deterministic pages, UTC boundaries, null actor and safe details", async ({ page }) => {
  await login(page); await page.goto("/en/staff/audit");
  await expect(page.getByText(/Total records: 36/)).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText(/Page 2 of 4/)).toBeVisible();
  await page.getByLabel("Action", { exact: true }).fill("staff.invited");
  await page.getByLabel("From (UTC)").fill("2026-09-15T08:00");
  await page.getByLabel("To (UTC)").fill("2026-09-15T08:00");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByText(/Total records: 4/)).toBeVisible();
  await page.getByLabel("From (UTC)").fill("2026-09-16T08:00");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByText(/From not later than To/)).toBeVisible();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.getByText(/Total records: 36/)).toBeVisible();
  const unknown = page.locator("tr, li").filter({ hasText: "future.unknown" }).filter({ visible: true }).first();
  await unknown.getByRole("button", { name: "View", exact: true }).click();
  const detail = page.getByRole("dialog");
  await expect(detail.getByText("future-entity")).toBeVisible();
  await expect(detail.getByText("<img src=x onerror=alert(1)> is plain text")).toBeVisible();
  await expect(detail.getByRole("img")).toHaveCount(0);
  expect(await page.locator("body").innerText()).not.toMatch(/pseudonym|userAgent|patientName|refresh_token/u);
});

test("non-admin direct routes make zero team/audit reads and retain account access", async ({ page }) => {
  for (const account of ["receptionist", "dentist"] as const) {
    await login(page, account);
    const reads: string[] = [];
    const listener = (req: import("@playwright/test").Request) => { if (/\/api\/v1\/(staff|audit-logs)(?:\?|\/|$)/u.test(req.url())) reads.push(req.url()); };
    page.on("request", listener);
    for (const route of ["team", "audit"]) { await page.goto(`/en/staff/${route}`); await expect(page.getByText("Access denied", { exact: true })).toBeVisible(); }
    expect(reads).toEqual([]); page.off("request", listener);
    await page.goto("/en/staff/account"); await expect(page.getByRole("heading", { name: "Account security" })).toBeVisible();
    await page.getByRole("button", { name: "Sign out", exact: true }).last().click();
  }
});

test("two administrator tabs cannot deactivate every active administrator", async ({ page, browser, request }) => {
  await login(page); await page.goto("/en/staff/team");
  const otherContext = await browser.newContext();
  await otherContext.route("**/*", async (route) => ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort("blockedbyclient"));
  try {
    const other = await otherContext.newPage(); await login(other, "secondAdmin"); await other.goto("/en/staff/team");
    await card(page, previewAccounts.secondAdmin.id).getByRole("button", { name: "Deactivate staff" }).click();
    await card(other, previewAccounts.admin.id).getByRole("button", { name: "Deactivate staff" }).click();
    const responses = [page.waitForResponse((response) => response.url().endsWith("/deactivate") && response.request().method() === "POST"), other.waitForResponse((response) => response.url().endsWith("/deactivate") && response.request().method() === "POST")];
    await Promise.all([page, other].map((tab) => tab.getByRole("dialog").getByRole("button", { name: "Confirm change" }).click()));
    const statuses = (await Promise.all(responses)).map((response) => response.status());
    expect(statuses.filter((status) => status === 200)).toHaveLength(1);
    const logins = await Promise.all([previewAccounts.admin, previewAccounts.secondAdmin].map((account) => request.post(`${apiUrl}/api/v1/auth/login`, { data: { email: account.email, password: previewPassword } })));
    const survivor = logins.find((response) => response.ok());
    expect(logins.filter((response) => response.ok())).toHaveLength(1);
    const token = (await survivor!.json()).data.accessToken;
    const staff = await request.get(`${apiUrl}/api/v1/staff?role=admin&isActive=true&setupComplete=true`, { headers: { Authorization: `Bearer ${token}` } });
    expect((await staff.json()).data.pagination.total).toBe(1);
  } finally { await otherContext.close(); }
});

test("HY/RU/EN governance is responsive, keyboard-operable, axe-clean, and provider-free", async ({ page }) => {
  test.setTimeout(180_000); // Thirty locale/route/width + Axe combinations.
  const errors: string[] = []; const external: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (["error", "warning"].includes(message.type()) && !/Failed to load resource:.*401/u.test(message.text())) errors.push(message.text()); });
  page.on("request", (req) => { if (!["127.0.0.1", "localhost"].includes(new URL(req.url()).hostname)) external.push(req.url()); });
  await login(page);
  for (const width of [375, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const locale of ["hy", "ru", "en"] as const) for (const route of ["team", "audit"] as const) {
      await page.goto(`/${locale}/staff/${route}`);
      await expect(page.getByRole("heading", { name: route === "team" ? staffGovernanceMessages[locale].teamTitle : staffGovernanceMessages[locale].auditTitle })).toBeVisible();
      await expect(page.getByRole("button", { name: staffMessages[locale].applyFilters })).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
      expect(await page.locator("h1").evaluate((heading) => heading.scrollWidth > heading.clientWidth)).toBe(false);
      expect((await new AxeBuilder({ page }).analyze()).violations.filter((item) => ["serious", "critical"].includes(item.impact || ""))).toEqual([]);
    }
  }
  await page.goto("/en/staff/team"); await page.getByRole("button", { name: "Invite staff" }).click();
  await expect(page.getByRole("dialog")).toBeVisible(); await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(errors).toEqual([]); expect(external).toEqual([]);
});

test("expanded localized navigation keeps sign-out reachable on short desktop and mobile screens", async ({ page }) => {
  await login(page);
  for (const locale of ["hy", "ru", "en"] as const) {
    await page.setViewportSize({ width: 1440, height: 600 });
    await page.goto(`/${locale}/staff/team`);
    const logout = page.getByRole("button", { name: staffMessages[locale].logout, exact: true }).last();
    await expect(logout).toBeVisible();
    const desktop = await logout.boundingBox();
    expect(desktop).not.toBeNull();
    expect(desktop!.y + desktop!.height).toBeLessThanOrEqual(600);
    await page.getByRole("link", { name: staffGovernanceMessages[locale].auditNav, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/staff/audit$`));
    await page.setViewportSize({ width: 375, height: 600 });
    await page.getByRole("button", { name: staffMessages[locale].menu, exact: true }).click();
    const menu = page.getByRole("dialog");
    const mobile = await menu.getByRole("button", { name: staffMessages[locale].logout, exact: true }).boundingBox();
    expect(mobile).not.toBeNull();
    expect(mobile!.y + mobile!.height).toBeLessThanOrEqual(600);
    await menu.getByRole("link", { name: staffGovernanceMessages[locale].teamNav, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/staff/team$`));
    await expect(menu).toHaveCount(0);
  }
});
