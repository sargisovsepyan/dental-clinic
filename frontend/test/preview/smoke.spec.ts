import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { buildArelisContent } from './arelis-content.mjs';
import { previewAccounts, previewPassword } from '../e2e/mock-api.mjs';
import { productMessages } from '../../src/i18n/product-messages';
import { staffMessages } from '../../src/i18n/staff-messages';
import { bookingMessages } from '../../src/i18n/booking-messages';
import { expectHeroTextWithinViewport, expectPublicHeadingsWithinViewport } from './hero-geometry';

const content = buildArelisContent(previewAccounts);
test.beforeEach(async ({ page, request }) => {
  const reset = await request.get('http://127.0.0.1:5000/__test__/scenario/success');
  expect(reset.ok()).toBe(true);
  const clinic = await request.get('http://127.0.0.1:5000/api/v1/clinic');
  expect((await clinic.json()).data.clinic.translations.en.clinicName).toBe('Arelis Dental');
  await page.route('**/*', (route) => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
    ? route.continue() : route.abort('blockedbyclient'));
});

async function login(page: Page, role: 'admin' | 'dentist') {
  await page.goto('/en/staff/login');
  await expect(page.getByText(staffMessages.en.loginIntro)).toBeVisible();
  await page.getByLabel(staffMessages.en.email).fill(previewAccounts[role].email);
  await page.getByLabel(staffMessages.en.password, { exact: true }).fill(previewPassword);
  await page.getByRole('button', { name: staffMessages.en.signIn, exact: true }).click();
  await expect(page).toHaveURL(/\/en\/staff$/, { timeout: 20_000 });
}

for (const locale of ['hy', 'ru', 'en'] as const) {
  test(`supervised ${locale} preview has polished public content and distinct loaded illustrations`, async ({ page }, info) => {
    // Same expanded public crawl as E2E, plus responsive visual captures.
    test.setTimeout(180_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.setViewportSize({ width: 375, height: 900 });
    for (const route of ['', 'services', `services/${content.services[2].slug}`, 'dentists',
      `dentists/${content.dentists[3].slug}`, 'gallery', 'before-after', `before-after/${content.cases[0]._id}`, 'clinic', 'book']) {
      const response = await page.goto(`/${locale}/${route}`);
      expect(response?.status()).toBe(200);
      await expect(page.locator('h1')).toBeVisible();
      await expectPublicHeadingsWithinViewport(page);
      const ordinary = await page.locator('main').innerText();
      expect(ordinary).not.toMatch(/test|preview|example\.test|<img|onerror|XSS|тест|թեստ|փորձնական/iu);
      if (locale !== 'hy') expect(ordinary).not.toMatch(/\p{Script=Armenian}/u);
      if (route === 'services') {
        for (const service of content.services) await expect(page.getByRole('heading', { level: 3, name: service.translations[locale].name, exact: true })).toBeVisible();
      }
      if (route === 'dentists') await expect(page.locator('main h2')).toHaveCount(5);
      if (route === 'before-after') await expect(page.locator('main article')).toHaveCount(3);
      if (route === 'gallery' || route === 'clinic') {
        const images = page.locator('main img[src*="/illustrations/"]');
        await expect(images).toHaveCount(4);
        await expect.poll(() => images.evaluateAll((items) => items.every((item) => (item as HTMLImageElement).complete && (item as HTMLImageElement).naturalWidth > 0))).toBe(true);
      }
      if (route === 'clinic') {
        const map = page.locator(`main a[href="${content.clinic.mapUrl}"]`);
        await expect(map).toHaveCount(1); await expect(map).toHaveAttribute('rel', 'noopener noreferrer');
        expect((await new AxeBuilder({ page }).analyze()).violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? ''))).toEqual([]);
        await page.screenshot({ path: info.outputPath(`${locale}-clinic.png`), fullPage: true });
      }
    }
    for (const service of content.services) {
      const response = await page.goto(`/${locale}/services/${service.slug}`);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(service.translations[locale].name);
      await expectPublicHeadingsWithinViewport(page);
      if (service.slug === 'professional-hygiene') await page.screenshot({ path: info.outputPath(`${locale}-service-mobile.png`) });
    }
    for (const width of [320, 375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 }); await page.goto(`/${locale}`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(productMessages[locale].hero);
      await expectHeroTextWithinViewport(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await expect(page.getByRole('button', { name: /Open Next\.js Dev Tools/i })).toHaveCount(0);
      await page.screenshot({ path: info.outputPath(`${locale}-home-${width}.png`), fullPage: true });
      if (width === 375) await page.screenshot({ path: info.outputPath(`${locale}-hero-mobile.png`) });
    }
    expect(errors).toEqual([]);
  });
}

test('supervised booking confirms a 90-minute visit without exposing patient contacts', async ({ page }, info) => {
  const selected = content.services[6]; const doctor = content.dentists[3];
  await page.goto(`/en/book?service=${selected.slug}&dentist=${doctor.slug}`);
  const date = new Date(Date.now() + 12 * 86_400_000);
  if (date.getUTCDay() === 0) date.setUTCDate(date.getUTCDate() + 1);
  await page.getByLabel('Visit date').fill(date.toISOString().slice(0, 10));
  await page.getByRole('button', { name: 'Choose 09:00', exact: true }).click();
  await page.locator('input[name="patientName"]').fill('Alex Martin');
  await page.locator('input[name="patientPhone"]').fill('+37499000009');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: bookingMessages.en.submit, exact: true }).click();
  await expect(page.getByRole('heading', { name: bookingMessages.en.confirmedTitle, exact: true })).toBeVisible();
  await expect(page.locator('main')).toContainText(selected.translations.en.name);
  await expect(page.locator('main')).toContainText('Davit Petrosyan');
  await expect(page.locator('main')).toContainText('10:30');
  await expect(page.locator('main')).not.toContainText('+37499000009');
  await page.screenshot({ path: info.outputPath('confirmed-booking.png'), fullPage: true });
});

test('supervised admin services, appointment defaults, explicit doctor linking and dentist scope', async ({ page }, info) => {
  test.setTimeout(120_000);
  await login(page, 'admin'); await page.goto('/en/staff/services');
  await expect(page.getByRole('tab', { name: 'Services', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: 'Add service', exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('admin-services.png'), fullPage: true });
  await page.getByRole('tab', { name: 'Service sections', exact: true }).click();
  await expect(page.getByText(productMessages.en.sectionHelp)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add section', exact: true })).toBeVisible();
  await page.goto('/en/staff/appointments'); await expect(page.getByRole('table').getByText('Alex Martin', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'New appointment', exact: true }).click();
  const create = page.getByRole('dialog');
  await create.getByLabel('Patient name', { exact: true }).fill('Anna Daniel');
  await create.getByLabel('Patient phone', { exact: true }).fill('+37499000008');
  await create.getByRole('combobox', { name: 'Service', exact: true }).selectOption(content.services[2]._id);
  await create.getByRole('combobox', { name: 'Dentist', exact: true }).selectOption(content.dentists[3]._id);
  const visit = new Date(Date.now() + 13 * 86_400_000);
  if (visit.getUTCDay() === 0) visit.setUTCDate(visit.getUTCDate() + 1);
  await create.locator('input[type="date"]').fill(visit.toISOString().slice(0, 10));
  await create.getByRole('button', { name: 'Check availability', exact: true }).click();
  await create.getByRole('button', { name: /12:00–13:00/ }).click();
  await create.getByRole('checkbox').check();
  await create.getByRole('button', { name: 'Create appointment', exact: true }).click();
  await expect(page.getByText('Appointment created.', { exact: true })).toBeVisible();
  await expect(page.locator('tr').filter({ hasText: 'Anna Daniel' })).toContainText('Confirmed');
  await page.goto('/en/staff/team');
  await page.getByTestId(`staff-${previewAccounts.dentist.id}`).getByRole('button', { name: 'View', exact: true }).click();
  const dialog = page.getByRole('dialog'); const binding = dialog.getByRole('combobox', { name: productMessages.en.doctorAssignment, exact: true });
  await expect(binding).toHaveValue(content.dentists[3]._id);
  await binding.selectOption(content.dentists[2]._id);
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog.getByText(productMessages.en.assignmentSaved)).toBeVisible();
  await binding.selectOption(content.dentists[3]._id);
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(binding).toHaveValue(content.dentists[3]._id);
  await expect(dialog.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).last().click();
  await expect(page).toHaveURL(/\/en\/staff\/login$/);
  const protectedReads: string[] = [];
  page.on('request', (request) => { if (request.url().includes('/api/v1/')) protectedReads.push(new URL(request.url()).pathname); });
  await login(page, 'dentist');
  await expect(page.getByText('Davit Petrosyan').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'My appointments', exact: true })).toBeVisible();
  await expect(page.getByText('Alex Martin', { exact: true })).toBeVisible();
  await expect(page.getByText('Levon Adam', { exact: true })).toHaveCount(0);
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`dentist-workspace-${width}.png`), fullPage: true });
  }
  expect(protectedReads.filter((path) => /appointments(?!\/mine)|\/staff|\/admin\/|audit-logs/.test(path))).toEqual([]);
  expect((await new AxeBuilder({ page }).analyze()).violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? ''))).toEqual([]);
});
