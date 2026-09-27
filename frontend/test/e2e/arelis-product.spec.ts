import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { Server } from 'node:http';
import { createMockApiServer, previewPassword, previewAccounts } from './mock-api.mjs';
import { buildArelisContent } from '../preview/arelis-content.mjs';
import { productMessages } from '../../src/i18n/product-messages';
import { messages } from '../../src/i18n/messages';
import { staffMessages } from '../../src/i18n/staff-messages';
import { expectHeroTextWithinViewport, expectPublicHeadingsWithinViewport } from '../preview/hero-geometry';
let server: Server;
const content = buildArelisContent(previewAccounts);
const apiUrl = 'http://127.0.0.1:5100/api/v1';
test.beforeAll(async () => {
  server = createMockApiServer(5100, 'success', { profile: 'arelis' });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(5100, '127.0.0.1', resolve); });
});
test.afterAll(async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); });
test.beforeEach(async ({ page, request }) => {
  await request.get('http://127.0.0.1:5100/__test__/scenario/success');
  await page.route('**/*', (route) => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort('blockedbyclient'));
});
async function login(page: Page, locale: 'hy' | 'ru' | 'en', role: string) {
  const copy = staffMessages[locale]; await page.goto(`/${locale}/staff/login`);
  await page.getByLabel(copy.email).fill(`${role}@preview.local`);
  await page.getByLabel(copy.password, { exact: true }).fill(previewPassword);
  await page.getByRole('button', { name: copy.signIn, exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`/${locale}/staff${role === 'dentist' ? '/my-appointments' : ''}/?$`),
    { timeout: 20_000 },
  );
}
for (const locale of ['hy', 'ru', 'en'] as const) {
  test(`Arelis ${locale} public content is complete, locale-correct and responsive`, async ({ page }) => {
    // This crawl includes cold route compilation and all 19 service details.
    // Bound this scenario only; the suite's global timeout remains unchanged.
    test.setTimeout(180_000);
    const browserErrors: string[] = [];
    page.on('pageerror', (error) => browserErrors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(message.text()); });
    for (const width of [320, 375, 430, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 }); await page.goto(`/${locale}`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(productMessages[locale].hero);
      await expectHeroTextWithinViewport(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    }
    for (const [label, path] of [
      [messages[locale].allServices, 'services'],
      [messages[locale].allDentists, 'dentists'],
      [messages[locale].openGallery, 'gallery'],
      [messages[locale].allCases, 'before-after'],
    ] as const) {
      await expect(page.locator('main').getByRole('link', { name: label, exact: true })).toHaveAttribute('href', `/${locale}/${path}`);
    }
    await page.setViewportSize({ width: 375, height: 900 });
    for (const route of ['', 'services', `services/${content.services[2].slug}`, 'dentists', `dentists/${content.dentists[3].slug}`, 'gallery', 'before-after', `before-after/${content.cases[0]._id}`, 'clinic', 'book']) {
      await page.goto(`/${locale}/${route}`); await expect(page.locator('h1')).toBeVisible();
      await expectPublicHeadingsWithinViewport(page);
      const visible = await page.locator('main').innerText();
      expect(visible).not.toMatch(/test|preview|example\.test|<img|onerror|XSS|тест|թեստ|փորձնական/iu);
      if (locale !== 'hy') expect(visible).not.toMatch(/\p{Script=Armenian}/u);
    }
    for (const [serviceIndex, service] of content.services.entries()) {
      await page.goto(`/${locale}/services/${service.slug}`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(service.translations[locale].name);
      await expectPublicHeadingsWithinViewport(page);
      if (serviceIndex === 0) {
        const informationHeading = page.getByRole('heading', { name: productMessages[locale].procedure, exact: true });
        const informationSection = informationHeading.locator('xpath=ancestor::section[1]');
        const [headingBox, sectionBox] = await Promise.all([informationHeading.boundingBox(), informationSection.boundingBox()]);
        expect(headingBox).not.toBeNull();
        expect(sectionBox).not.toBeNull();
        expect(headingBox!.y - sectionBox!.y).toBeGreaterThanOrEqual(40);
      }
    }
    await page.goto(`/${locale}/dentists`); await expect(page.locator('main h2')).toHaveCount(5);
    await page.goto(`/${locale}/services`); await expect(page.getByRole('heading', { name: content.services[2].translations[locale].name, exact: true })).toBeVisible();
    const categoryHeading = page.getByRole('heading', { level: 2, name: content.categories[0].translations[locale].name, exact: true });
    await expect(categoryHeading).toHaveCount(1);
    await expect(categoryHeading.locator('xpath=..').getByText(content.categories[0].translations[locale].name, { exact: true })).toHaveCount(1);
    await page.goto(`/${locale}/clinic`);
    await expect(page.getByText(content.clinic.translations[locale].tagline, { exact: true })).toBeVisible();
    await expect(page.getByText('Стоматология в центре Еревана', { exact: true })).toHaveCount(0);
    const map = page.locator(`main a[href="${content.clinic.mapUrl}"]`);
    await expect(map).toHaveCount(1); await expect(map).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(page.locator('main img[src*="/illustrations/"]')).toHaveCount(4);
    expect(await page.locator('main img[src*="/illustrations/"]').evaluateAll((images) => images.every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations.filter((issue) => ['serious', 'critical'].includes(issue.impact ?? ''))).toEqual([]);
    expect(browserErrors).toEqual([]);
  });
}
test('shared public page introductions align with principal desktop content', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const route of ['services', 'dentists', 'gallery', 'before-after', 'clinic']) {
    await page.goto(`/en/${route}`);
    const intro = page.locator('main > header.site-container');
    const contentContainer = page.locator('main > div.site-container').first();
    const [introBox, contentBox] = await Promise.all([intro.boundingBox(), contentContainer.boundingBox()]);
    expect(introBox).not.toBeNull();
    expect(contentBox).not.toBeNull();
    expect(Math.abs(introBox!.x - contentBox!.x)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
});
test('dentist sees only assigned visits with zero forbidden management fetches at mobile/tablet/desktop', async ({ page }) => {
  const reads: string[] = []; page.on('request', (request) => { if (request.url().includes('/api/v1/')) reads.push(new URL(request.url()).pathname); });
  await login(page, 'en', 'dentist');
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 }); await page.goto('/en/staff/my-appointments');
    await expect(page.getByText('Alex Martin', { exact: true })).toBeVisible();
    await expect(page.getByText('Sofia David', { exact: true })).toBeVisible();
    await expect(page.getByText('Levon Adam', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'View', exact: true }).first().click();
    await expect(page.getByText('+37499000001', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations.filter((issue) => ['serious', 'critical'].includes(issue.impact ?? ''))).toEqual([]);
  }
  expect(reads.filter((path) => /appointments(?!\/mine)|\/staff|\/admin\/|audit-logs/.test(path))).toEqual([]);
  await page.goto('/en/staff/services'); await expect(page.getByText('Access denied')).toBeVisible();
});
test('public dentist hiding preserves active employee appointments while employee deactivation revokes them', async ({ page, request }) => {
  const linkedProfile = content.dentists.find((item) => item._id === content.staff.dentist.dentistProfile)!;
  await login(page, 'en', 'dentist');
  await expect(page.getByText('Alex Martin', { exact: true })).toBeVisible();
  await expect(page.getByText('Levon Adam', { exact: true })).toHaveCount(0);

  const adminLogin = await request.post(`${apiUrl}/auth/login`, {
    data: { email: previewAccounts.admin.email, password: previewPassword },
  });
  expect(adminLogin.ok()).toBe(true);
  const adminAccessToken = (await adminLogin.json()).data.accessToken as string;
  const adminHeaders = { Authorization: `Bearer ${adminAccessToken}` };
  const hidden = await request.delete(`${apiUrl}/dentists/${linkedProfile._id}`, { headers: adminHeaders });
  expect(hidden.ok()).toBe(true);

  await page.reload();
  await expect(page.getByText('Alex Martin', { exact: true })).toBeVisible();
  await expect(page.getByText('Levon Adam', { exact: true })).toHaveCount(0);
  const publicList = await request.get(`${apiUrl}/dentists`);
  expect((await publicList.json()).data.dentists.some((item: { _id: string }) => item._id === linkedProfile._id)).toBe(false);
  expect((await request.get(`${apiUrl}/dentists/${linkedProfile.slug}`)).status()).toBe(404);

  const deactivated = await request.post(`${apiUrl}/staff/${previewAccounts.dentist.id}/deactivate`, { headers: adminHeaders });
  expect(deactivated.ok()).toBe(true);
  const privateReads: string[] = [];
  page.on('request', (browserRequest) => {
    if (new URL(browserRequest.url()).pathname.startsWith('/api/v1/appointments/mine')) privateReads.push(browserRequest.url());
  });
  await page.reload();
  await expect(page).toHaveURL(/\/en\/staff\/login$/);
  expect(privateReads).toEqual([]);
});
test('admin services default to services, show human sections and retain hide guards', async ({ page }) => {
  await login(page, 'en', 'admin'); await page.goto('/en/staff/services');
  await expect(page.getByRole('tab', { name: 'Services', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: 'Add service', exact: true })).toBeVisible();
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  await page.getByRole('tab', { name: 'Service sections' }).click();
  await expect(page.getByRole('button', { name: 'Add section' })).toBeVisible();
  await expect(page.getByText(productMessages.en.sectionHelp)).toBeVisible();
  const section = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Hygiene and prevention', exact: true }) });
  await section.getByRole('button', { name: 'Hide from site' }).click();
  const hideResponse = page.waitForResponse((response) =>
    response.request().method() === 'DELETE' &&
    /\/api\/v1\/service-categories\/[0-9a-f]{24}$/i.test(new URL(response.url()).pathname),
  );
  await page.getByRole('dialog').getByRole('button', { name: 'Hide from site' }).click();
  const blockedHide = await hideResponse;
  expect(blockedHide.status()).toBe(409);
  expect(await blockedHide.json()).toMatchObject({ success: false, code: 'CATEGORY_HAS_ACTIVE_SERVICES' });
  await expect(page.getByText('Hide the active services in this section first.')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).first().click();
  await expect(section).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations.filter((issue) => ['serious', 'critical'].includes(issue.impact ?? ''))).toEqual([]);
});
