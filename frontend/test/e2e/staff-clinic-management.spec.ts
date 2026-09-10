import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import type { Server } from "node:http";
import { createMockApiServer, previewAccounts, previewPassword } from "./mock-api.mjs";

let mockApi: Server;

function clinicDate(daysAhead: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Yerevan", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(Date.now() + daysAhead * 86_400_000));
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

async function setScenario(request: APIRequestContext, scenario: string) {
  const response = await request.get(`http://127.0.0.1:5100/__test__/scenario/${scenario}`);
  expect(response.ok()).toBe(true);
}

async function login(page: Page, role: keyof typeof previewAccounts = "admin") {
  await page.goto("/en/staff/login");
  await page.getByLabel("Email address").fill(previewAccounts[role].email);
  await page.getByLabel("Password").fill(previewPassword);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/en\/staff\/?$/, { timeout: 20_000 });
}

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

test.beforeEach(async ({ page, request }) => {
  await setScenario(request, "success");
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") await route.continue();
    else await route.abort("blockedbyclient");
  });
});

test("catalog creation uses localized server state and referential conflicts fail closed", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  const updates: Array<Record<string, unknown>> = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && /\/api\/v1\/(service-categories|services)$/.test(request.url())) {
      writes.push(request.postDataJSON() as Record<string, unknown>);
    }
    if (request.method() === "PATCH" && /\/api\/v1\/(service-categories|services)\/[0-9a-f]{24}$/.test(request.url())) {
      updates.push(request.postDataJSON() as Record<string, unknown>);
    }
  });

  await login(page);
  await page.goto("/en/staff/services");
  await expect(page.getByRole("heading", { name: "Services and categories" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Therapeutic dentistry" })).toBeVisible();

  await page.getByRole("button", { name: "Add category" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog.getByText("Review the highlighted fields.")).toBeVisible();
  expect(writes).toHaveLength(0);
  await dialog.getByRole("textbox", { name: "Category name *", exact: true }).fill("Նոր կատեգորիա");
  await dialog.getByLabel("Display order").fill("2");
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("heading", { name: "Նոր կատեգորիա" })).toBeVisible();
  await page.locator("article").filter({ hasText: "Նոր կատեգորիա" }).getByRole("button", { name: "Edit" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "English (EN)" }).click();
  await dialog.getByRole("tabpanel", { name: "English (EN)" }).getByLabel("Category name (Optional)").fill("Preview category");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: "Preview category" })).toBeVisible();

  await page.getByRole("tab", { name: "Services", exact: true }).click();
  await page.getByRole("button", { name: "Add service" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Service name *", exact: true }).fill("Նոր ծառայություն");
  await dialog.getByLabel("Category").selectOption("64b000000000000000000002");
  await dialog.getByLabel("Duration (minutes)").fill("10");
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog.getByText("Review the highlighted fields.")).toBeVisible();
  expect(writes).toHaveLength(1);
  await dialog.getByLabel("Duration (minutes)").fill("45");
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("heading", { name: "Նոր ծառայություն" })).toBeVisible();
  await page.locator("article").filter({ hasText: "Նոր ծառայություն" }).getByRole("button", { name: "Edit" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "English (EN)" }).click();
  await dialog.getByRole("tabpanel", { name: "English (EN)" }).getByLabel("Service name (Optional)").fill("Preview service");
  await dialog.getByLabel("Duration (minutes)").fill("50");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: "Preview service" })).toBeVisible();
  expect(writes).toHaveLength(2);
  expect(writes.every((body) => !("slug" in body) && !("imageUrl" in body))).toBe(true);
  expect(updates).toHaveLength(2);
  expect(updates.every((body) => !("slug" in body) && !("imageUrl" in body))).toBe(true);

  await page.getByRole("tab", { name: "Categories" }).click();
  const categoryCard = page.locator("article").filter({ hasText: "Therapeutic dentistry" });
  await categoryCard.getByRole("button", { name: "Archive" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirm archive" }).click();
  await expect(page.getByText("Archive the active services in this category first.")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Archive this category?" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).first().click();
  await expect(page.getByRole("heading", { name: "Therapeutic dentistry" })).toBeVisible();

  await page.goto("/en/services");
  await expect(page.getByText("Preview service").first()).toBeVisible();
});

test("dentist lifecycle keeps profile writes separate from schedule and media", async ({ page }) => {
  let createPayload: Record<string, unknown> | undefined;
  let updatePayload: Record<string, unknown> | undefined;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/api/v1/dentists")) {
      createPayload = request.postDataJSON() as Record<string, unknown>;
    }
    if (request.method() === "PATCH" && /\/api\/v1\/dentists\/[0-9a-f]{24}$/.test(request.url())) {
      updatePayload = request.postDataJSON() as Record<string, unknown>;
    }
  });

  await login(page);
  await page.goto("/en/staff/dentists");
  await expect(page.getByRole("heading", { name: "Dentist profiles" })).toBeVisible();
  await page.getByRole("button", { name: "Add dentist" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog.getByText("Review the highlighted fields.")).toBeVisible();
  expect(createPayload).toBeUndefined();
  await dialog.getByLabel("First name").fill("Mane");
  await dialog.getByLabel("Last name").fill("Preview");
  await dialog.getByRole("textbox", { name: "Professional title *", exact: true }).fill("Մանկական ատամնաբույժ");
  await dialog.getByRole("checkbox", { name: "Ատամների մաքրում" }).check();
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("heading", { name: "Mane Preview" })).toBeVisible();
  expect(createPayload).toMatchObject({ weeklySchedule: [], bookingEnabled: false });
  expect(createPayload).not.toHaveProperty("slug");
  expect(createPayload).not.toHaveProperty("photoUrl");
  expect(createPayload).not.toHaveProperty("photo");

  await page.locator("article").filter({ hasText: "Mane Preview" }).getByRole("button", { name: "Edit" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Last name").fill("Updated");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  const card = page.locator("article").filter({ hasText: "Mane Updated" });
  await expect(card).toBeVisible();
  expect(updatePayload).toBeDefined();
  expect(updatePayload).not.toHaveProperty("weeklySchedule");
  expect(updatePayload).not.toHaveProperty("expectedScheduleRevision");
  expect(updatePayload).not.toHaveProperty("photoUrl");
  expect(updatePayload).not.toHaveProperty("photo");

  await card.getByRole("button", { name: "Archive" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirm archive" }).click();
  await expect(card.getByText("Archived")).toBeVisible();
  await card.getByRole("button", { name: "Restore" }).click();
  await expect(card.getByText("Published")).toBeVisible();
});

test("weekly schedules require exact impact acknowledgement and stale writes never retry", async ({ page, request }) => {
  await login(page);
  await page.goto("/en/staff/schedules");
  await expect(page.getByRole("heading", { name: "Schedules and date overrides" })).toBeVisible();
  await expect(page.getByText("Clinic timezone: Asia/Yerevan")).toBeVisible();

  await setScenario(request, "management-schedule-conflict");
  const conflictWrites: Array<Record<string, unknown>> = [];
  page.on("request", (networkRequest) => {
    if (networkRequest.method() === "PATCH" && networkRequest.url().endsWith("/api/v1/clinic")) {
      conflictWrites.push(networkRequest.postDataJSON() as Record<string, unknown>);
    }
  });
  const monday = page.locator("fieldset").filter({ hasText: "Monday" }).first();
  await monday.getByRole("checkbox").uncheck();
  await page.getByRole("button", { name: "Save weekly schedule" }).click();
  const impact = page.getByRole("dialog");
  await expect(impact.getByRole("heading", { name: "Appointments are affected" })).toBeVisible();
  await expect(impact).toContainText("Affected appointments: 1");
  await expect(impact).not.toContainText("Aram Preview");
  await expect(impact).not.toContainText("+374");
  await impact.getByRole("button", { name: "I reviewed the impact. Save these exact hours" }).click();
  await expect(page.getByText("The schedule was saved and authoritative revisions were refreshed.")).toBeVisible();
  expect(conflictWrites).toHaveLength(2);
  expect(conflictWrites[0]).not.toHaveProperty("scheduleConflictAcknowledgement");
  expect(conflictWrites[1]).toMatchObject({
    weeklySchedule: conflictWrites[0].weeklySchedule,
    expectedScheduleRevision: conflictWrites[0].expectedScheduleRevision,
    scheduleConflictAcknowledgement: "a".repeat(64),
  });

  await setScenario(request, "management-schedule-stale");
  await page.reload();
  const staleWrites: Array<Record<string, unknown>> = [];
  page.on("request", (networkRequest) => {
    if (networkRequest.method() === "PATCH" && networkRequest.url().endsWith("/api/v1/clinic")) {
      staleWrites.push(networkRequest.postDataJSON() as Record<string, unknown>);
    }
  });
  await page.locator("fieldset").filter({ hasText: "Monday" }).first().getByRole("checkbox").uncheck();
  await page.getByRole("button", { name: "Save weekly schedule" }).click();
  await expect(page.getByText(/Another operator changed this schedule/)).toBeVisible();
  expect(staleWrites).toHaveLength(1);
  await expect(page.getByText("Schedule revision: 1").first()).toBeVisible();
});

test("clinic and dentist date overrides refetch parent revisions after create and delete", async ({ page }) => {
  const closureDate = clinicDate(12);
  const exceptionDate = clinicDate(13);
  await login(page);
  await page.goto("/en/staff/schedules");

  await page.getByRole("tab", { name: "Clinic date overrides" }).click();
  await page.getByRole("button", { name: "Add date override" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Clinic date").fill(closureDate);
  await dialog.getByLabel("Operational note").fill("Preview closure");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  const closure = page.locator("article").filter({ hasText: closureDate });
  await expect(closure).toContainText("Preview closure");
  await closure.getByRole("button", { name: "Remove override" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirm removal" }).click();
  await expect(closure).toHaveCount(0);

  await page.getByRole("tab", { name: "Dentist exceptions" }).click();
  await page.getByLabel("Select a dentist").selectOption("64b000000000000000000021");
  await page.getByRole("button", { name: "Add date override" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Clinic date").fill(exceptionDate);
  await dialog.getByLabel("Operational note").fill("Preview day off");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator("article").filter({ hasText: exceptionDate })).toContainText("Preview day off");
  await expect(page.getByText("Schedule revision: 1").first()).toBeVisible();
});

test("clinic settings reject unsafe URLs and accept only the server-confirmed safe payload", async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  page.on("request", (request) => {
    if (request.method() === "PATCH" && request.url().endsWith("/api/v1/clinic")) {
      writes.push(request.postDataJSON() as Record<string, unknown>);
    }
  });
  await login(page);
  await page.goto("/en/staff/clinic");
  await expect(page.getByRole("heading", { name: "Clinic configuration" })).toBeVisible();
  await expect(page.getByText("Clinic timezone: Asia/Yerevan")).toBeVisible();
  await page.getByLabel("HTTPS map URL").fill("https://user:password@maps.google.com/place/test");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Use a credential-free HTTPS URL for the approved service.")).toBeVisible();
  expect(writes).toHaveLength(0);

  await page.getByLabel("HTTPS map URL").fill("https://maps.google.com/?q=Yerevan");
  await page.getByLabel("Primary phone").fill("+374 10 654321");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Clinic settings were saved from the authoritative response.")).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0]).not.toHaveProperty("timezone");
  expect(writes[0]).not.toHaveProperty("weeklySchedule");
  expect(writes[0]).not.toHaveProperty("scheduleRevision");
});

test("non-admin routes issue no management fetches and representative admin pages are responsive and axe-clean", async ({ page, request }) => {
  await login(page, "receptionist");
  await expect(page.getByRole("link", { name: "Services" })).toHaveCount(0);
  const managementRequests: string[] = [];
  page.on("request", (networkRequest) => {
    if (/\/(admin\/all|schedule-exceptions|clinic\/closures)/.test(networkRequest.url())) managementRequests.push(networkRequest.url());
  });
  for (const route of ["services", "dentists", "schedules", "clinic"]) {
    await page.goto(`/en/staff/${route}`);
    await expect(page.getByText("Access denied")).toBeVisible();
  }
  expect(managementRequests).toEqual([]);

  const auth = await request.post("http://127.0.0.1:5100/api/v1/auth/login", {
    data: { email: previewAccounts.receptionist.email, password: previewPassword },
  });
  const token = (await auth.json()).data.accessToken as string;
  const denied = await request.get("http://127.0.0.1:5100/api/v1/services/admin/all", {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(denied.status()).toBe(403);

  await page.getByRole("button", { name: "Sign out" }).last().click();
  await login(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/en/staff/services");
  await expect(page.getByRole("heading", { name: "Services and categories" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});
