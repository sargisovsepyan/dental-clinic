import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";
import type { Server } from "node:http";
import { createMockApiServer, previewAccounts, previewPassword } from "./mock-api.mjs";

let mockApi: Server;

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

const png = (name: string) => ({
  name,
  mimeType: "image/png",
  buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
});

async function openCaseEditor(page: Page) {
  await page.getByRole("button", { name: "Create before / after case" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Before *").setInputFiles(png("before.png"));
  await dialog.getByLabel("After *").setInputFiles(png("after.png"));
  await dialog.getByLabel("Case title *").fill("Նոր արդյունք");
  await dialog.getByRole("tab", { name: "English (EN)" }).click();
  await dialog.getByRole("tabpanel", { name: "English (EN)" }).getByLabel("Case title (Optional)").fill("New result");
  return dialog;
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

test("admin uploads, archives, restores, and validates gallery media without external requests", async ({ page }) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const host = new URL(request.url()).hostname;
    if (host !== "127.0.0.1" && host !== "localhost") externalRequests.push(request.url());
  });
  await login(page);
  await page.goto("/en/staff/media");
  await expect(page.getByRole("heading", { name: "Gallery and photos" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Test clinic photograph" })).toBeVisible();

  await page.getByRole("button", { name: "Upload gallery image" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Image file *").setInputFiles(png("new-gallery.png"));
  await dialog.getByLabel("Image description *").fill("Նոր պատկեր");
  await dialog.getByRole("tab", { name: "English (EN)" }).click();
  await dialog.getByRole("tabpanel", { name: "English (EN)" }).getByLabel("Image description (Optional)").fill("New gallery image");
  await dialog.getByRole("button", { name: "Upload" }).click();
  const created = page.locator("article").filter({ hasText: "New gallery image" });
  await expect(created).toBeVisible();
  await created.getByRole("button", { name: "Archive", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirm archive" }).click();
  await expect(created.getByText("Archived")).toBeVisible();
  await created.getByRole("button", { name: "Restore" }).click();
  await expect(created.getByText("Published")).toBeVisible();

  await page.getByRole("button", { name: "Upload gallery image" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Image file *").setInputFiles({ name: "not-image.txt", mimeType: "text/plain", buffer: Buffer.from("not an image") });
  await dialog.getByRole("button", { name: "Upload" }).click();
  await expect(dialog.getByText("The filename extension and browser media type must be one supported image format.")).toBeVisible();
  expect(externalRequests).toEqual([]);
});

test("failed dentist replacement preserves the prior photo and service removal is explicit", async ({ page, request }) => {
  await login(page);
  await page.goto("/en/staff/media");
  await page.getByRole("tab", { name: "Dentist photos" }).click();
  const dentist = page.locator("article").filter({ hasText: "Ani Test" });
  await expect(dentist.getByRole("img", { name: "Ani Test" })).toBeVisible();

  await setScenario(request, "media-replacement-failure");
  await dentist.getByRole("button", { name: "Replace image" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Image file *").setInputFiles(png("replacement.png"));
  await dialog.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByText(/server could not complete the media operation/i)).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).first().click();
  await expect(dentist.getByRole("img", { name: "Ani Test" })).toBeVisible();

  await page.getByRole("tab", { name: "Service images" }).click();
  const service = page.locator("article").filter({ hasText: "Tooth cleaning" });
  await service.getByRole("button", { name: "Remove image" }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/scheduled for permanent deletion/i)).toBeVisible();
  await dialog.getByRole("button", { name: "Confirm removal" }).click();
  await expect(service.getByRole("img", { name: "Tooth cleaning" })).toBeVisible();
});

test("a concurrent media conflict preserves the session and refetches authoritative state", async ({ page, request }) => {
  await login(page);
  await page.goto("/en/staff/media");
  await setScenario(request, "media-conflict");
  const item = page.locator("article").filter({ has: page.getByRole("heading", { name: "Test clinic photograph" }) });

  await item.getByRole("button", { name: "Archive", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Confirm archive" }).click();
  await dialog.getByRole("button", { name: "Cancel" }).first().click();

  await expect(page.getByText("Another administrator changed this image. Review the updated version before trying again.")).toBeVisible();
  await expect(page.getByText("Preview Admin").first()).toBeVisible();
  await expect(item.getByText("Published", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/en\/staff\/media$/);
});

test("pair creation requires explicit consent and a failed pair never appears partially", async ({ page, request }) => {
  let createRequests = 0;
  page.on("request", (networkRequest) => {
    if (networkRequest.method() === "POST" && networkRequest.url().endsWith("/api/v1/before-after")) createRequests += 1;
  });
  await login(page);
  await page.goto("/en/staff/before-after");
  await expect(page.getByRole("heading", { name: "Before & after" })).toBeVisible();
  let dialog = await openCaseEditor(page);
  await dialog.getByRole("button", { name: "Create case" }).click();
  await expect(dialog.getByText("Confirm that governed consent evidence exists before creating this case.")).toBeVisible();
  expect(createRequests).toBe(0);
  await dialog.getByRole("checkbox", { name: /selected consent method is supported/ }).check();
  await dialog.getByRole("button", { name: "Create case" }).click();
  const createdCase = page.locator("article").filter({ has: page.getByRole("heading", { name: "New result", exact: true }) });
  await expect(createdCase).toBeVisible();
  expect(createRequests).toBe(1);

  await createdCase.getByRole("button", { name: "Edit" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("checkbox", { name: "Featured" }).check();
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(createdCase.getByText("Featured", { exact: true })).toBeVisible();

  await setScenario(request, "media-pair-failure");
  await page.getByRole("button", { name: "Create before / after case" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Before *").setInputFiles(png("failed-before.png"));
  await dialog.getByLabel("After *").setInputFiles(png("failed-after.png"));
  await dialog.getByLabel("Case title *").fill("Չպահպանված զույգ");
  await dialog.getByRole("tab", { name: "English (EN)" }).click();
  await dialog.getByRole("tabpanel", { name: "English (EN)" }).getByLabel("Case title (Optional)").fill("Unsaved pair");
  await dialog.getByRole("checkbox", { name: /selected consent method is supported/ }).check();
  await dialog.getByRole("button", { name: "Create case" }).click();
  await expect(page.getByText(/server could not complete the media operation/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Չպահպանված զույգ" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Unsaved pair", exact: true })).toHaveCount(0);
  expect(createRequests).toBe(2);
});

test("consent withdrawal immediately removes the public case and purge retains only governance state", async ({ page, context, request }) => {
  await login(page);
  await page.goto("/en/staff/before-after");
  const caseCard = page.locator("article").filter({ has: page.getByRole("heading", { name: "Test case", exact: true }) });
  const publicResponse = await request.get("http://127.0.0.1:5100/api/v1/before-after/64b000000000000000000051");
  const publicCase = (await publicResponse.json()).data.case;
  for (const privateField of [
    "publicationStatus", "consentStatus", "consentMethod", "consentPolicyVersion",
    "consentConfirmedAt", "externalConsentReference", "withdrawalReason", "consentHistory", "createdBy",
  ]) expect(publicCase).not.toHaveProperty(privateField);
  await caseCard.getByRole("button", { name: "Withdraw consent" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Withdrawal reason").fill("Consent holder requested withdrawal");
  await dialog.getByRole("checkbox", { name: /consent withdrawal, not an ordinary archive/ }).check();
  await dialog.getByRole("button", { name: "Confirm consent withdrawal" }).click();
  await expect(caseCard.getByText("Withdrawn consent")).toBeVisible();
  await expect(caseCard.getByRole("button", { name: "Republish" })).toHaveCount(0);

  const publicPage = await (context as BrowserContext).newPage();
  await publicPage.goto("/en/before-after/64b000000000000000000051");
  await expect(publicPage.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await publicPage.close();

  await caseCard.getByRole("button", { name: "Permanently purge media" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Purge reason").fill("Governed retention request");
  await dialog.getByLabel("Type the confirmation phrase").fill("PERMANENTLY PURGE BEFORE AFTER MEDIA");
  await dialog.getByRole("button", { name: "Permanently purge both images" }).click();
  await expect(caseCard.getByText("Purged", { exact: true }).first()).toBeVisible();
  await expect(caseCard.getByRole("button", { name: "Permanently purge media" })).toHaveCount(0);
});

test("media routes deny non-admins without fetch leakage and admin screens stay responsive and axe-clean", async ({ page, request }) => {
  await login(page, "receptionist");
  await expect(page.getByRole("link", { name: "Gallery" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Before & After" })).toHaveCount(0);
  const adminRequests: string[] = [];
  page.on("request", (networkRequest) => {
    if (/\/(media\/gallery\/admin|before-after\/admin\/all)/.test(networkRequest.url())) adminRequests.push(networkRequest.url());
  });
  for (const route of ["media", "before-after"]) {
    await page.goto(`/en/staff/${route}`);
    await expect(page.getByText("Access denied")).toBeVisible();
  }
  expect(adminRequests).toEqual([]);

  const auth = await request.post("http://127.0.0.1:5100/api/v1/auth/login", {
    data: { email: previewAccounts.receptionist.email, password: previewPassword },
  });
  const token = (await auth.json()).data.accessToken as string;
  const denied = await request.get("http://127.0.0.1:5100/api/v1/media/gallery/admin", {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(denied.status()).toBe(403);

  await page.getByRole("button", { name: "Sign out" }).last().click();
  await login(page);
  for (const width of [375, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/en/staff/media");
    await expect(page.getByRole("heading", { name: "Gallery and photos" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  }
  await page.goto("/en/staff/before-after");
  await expect(page.getByRole("heading", { name: "Test case", exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.content()).not.toContain("preview-access-");
  expect(await page.content()).not.toContain("+374 99");
});
