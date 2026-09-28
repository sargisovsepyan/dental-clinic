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
  await new Promise<void>((resolve, reject) => mockApi.close((error) => error ? reject(error) : resolve()));
});

const setScenario = async (request: APIRequestContext) => {
  const response = await request.get("http://127.0.0.1:5100/__test__/scenario/success");
  expect(response.ok()).toBe(true);
};

test.beforeEach(async ({ page, request }) => {
  await setScenario(request);
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") await route.continue();
    else await route.abort("blockedbyclient");
  });
});

test("native date input stays inside the booking card at iPhone widths", async ({ page }) => {
  await page.goto("/en/book?service=test-cleaning&dentist=ani-test");

  for (const viewport of [
    { width: 320, height: 760 },
    { width: 375, height: 812 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
  ]) {
    await page.setViewportSize(viewport);

    const dateInput = page.getByLabel("Visit date");
    await expect(dateInput).toBeVisible();
    const geometry = await dateInput.evaluate((element) => {
      const input = element.getBoundingClientRect();
      const card = element.closest("section")?.getBoundingClientRect();
      return {
        inputLeft: input.left,
        inputRight: input.right,
        cardLeft: card?.left,
        cardRight: card?.right,
        hasHorizontalOverflow:
          document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });

    expect(geometry.cardLeft).toBeDefined();
    expect(geometry.cardRight).toBeDefined();
    expect(geometry.inputLeft).toBeGreaterThanOrEqual(geometry.cardLeft!);
    expect(geometry.inputRight).toBeLessThanOrEqual(geometry.cardRight! + 0.5);
    expect(geometry.hasHorizontalOverflow).toBe(false);
  }
});
