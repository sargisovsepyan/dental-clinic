import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildArelisContent } from './preview/arelis-content.mjs';
import { previewAccounts } from './e2e/mock-api.mjs';
import { serviceView, dentistView, clinicView, beforeAfterView } from '@/api/public-view-models';
import { safeManagedImage, safeExternalUrl } from '@/lib/safe-urls';
import type { ServiceRecord, DentistRecord, ClinicRecord, BeforeAfterRecord } from '@/api/public-client';

const content = buildArelisContent(previewAccounts);
afterEach(() => vi.unstubAllEnvs());
describe('Arelis manual content profile', () => {
  it('has nine unique sections, nineteen valid priced/bookable services and five linked doctors', () => {
    expect(content.categories).toHaveLength(9);
    expect(content.services).toHaveLength(19);
    expect(content.dentists).toHaveLength(5);
    expect(new Set(content.categories.map((item) => item.slug)).size).toBe(9);
    expect(new Set(content.services.map((item) => item.slug)).size).toBe(19);
    expect(new Set(content.dentists.map((item) => item.slug)).size).toBe(5);
    expect(content.services.map((item) => [item.priceFrom, item.durationMinutes])).toEqual([
      [0, 30], [3000, 15], [20000, 60], [10000, 30], [20000, 60], [35000, 90],
      [30000, 90], [25000, 60], [15000, 45], [40000, 60], [180000, 60], [50000, 60],
      [85000, 90], [110000, 90], [90000, 90], [220000, 60], [900000, 60], [15000, 45], [10000, 30],
    ]);
    for (const service of content.services) {
      expect(content.categories.some((item) => item._id === service.category._id)).toBe(true);
      expect(service.isActive && service.bookingEnabled).toBe(true);
      expect(content.dentists.some((doctor) => doctor.services.some((item: { _id: string }) => item._id === service._id))).toBe(true);
    }
    expect(content.services[2].category.slug).toBe('hygiene-prevention');
    for (const doctor of content.dentists) {
      expect(doctor.isActive && doctor.bookingEnabled).toBe(true);
      expect(doctor.experienceYears).toBe(0);
      expect(doctor.weeklySchedule).toHaveLength(7);
      for (const service of doctor.services) expect(content.services.some((item) => item._id === service._id)).toBe(true);
    }
  });
  for (const locale of ['hy', 'ru', 'en'] as const) {
    it(`renders complete ${locale} content without primary-locale leakage`, () => {
      for (const source of content.services) {
        const view = serviceView(source as ServiceRecord, locale);
        expect(view.name.text).toBe(source.translations[locale].name);
        expect(view.description.text).toBe(source.translations[locale].description);
        expect(view.shortDescription.text).toBe(source.translations[locale].shortDescription);
        expect(view.description.text.length).toBeGreaterThan(80);
        if (locale !== 'hy') expect(JSON.stringify(view)).not.toMatch(/\p{Script=Armenian}/u);
      }
      for (const source of content.dentists) {
        const view = dentistView(source as DentistRecord, locale);
        expect(view.fullName).toBe(`${source.translations[locale].firstName} ${source.translations[locale].lastName}`);
        expect(view.title.text).toBe(source.translations[locale].title);
        if (locale !== 'hy') expect(JSON.stringify(view)).not.toMatch(/\p{Script=Armenian}/u);
      }
      expect(clinicView(content.clinic as ClinicRecord, locale).name.text).toBe('Arelis Dental');
      for (const source of content.cases) {
        const view = beforeAfterView(source as BeforeAfterRecord, locale);
        expect(view.title.text).toBe(source.translations[locale].title);
        if (locale !== 'hy') expect(JSON.stringify(view)).not.toMatch(/\p{Script=Armenian}/u);
      }
    });
  }
  it('contains no test/security/developer copy in ordinary display values and keeps online auto-confirm explicit', () => {
    const ordinary = [content.clinic.translations, ...content.categories.map((item) => item.translations),
      ...content.services.map((item) => item.translations), ...content.dentists.map((item) => item.translations),
      ...content.gallery.map((item) => item.translations), ...content.cases.map((item) => item.translations),
      ...Object.values(content.staff).map((item) => item.nameTranslations)];
    expect(JSON.stringify(ordinary)).not.toMatch(/test|preview|example\.test|<img|onerror|XSS|тест|թեստ|փորձնական/iu);
    expect(content.clinic.bookingSettings.autoConfirmAppointments).toBe(true);
    expect(content.staff.dentist.dentistProfile).toBe(content.dentists[3]._id);
    expect(safeExternalUrl(content.clinic.mapUrl)).toBe(content.clinic.mapUrl);
    const map = new URL(content.clinic.mapUrl);
    expect(map.protocol).toBe('https:'); expect(map.hostname).toBe('www.google.com');
    expect(map.searchParams.get('query')).toBe('Republic Square, Yerevan');
  });
  it('uses ten distinct strictly scoped local illustrations, never accepted as production media', () => {
    const assets = [...content.gallery.map((item) => item.image), ...content.cases.flatMap((item) => [item.beforeImage, item.afterImage])];
    expect(new Set(assets.map((item) => item.secureUrl)).size).toBe(10);
    for (const asset of assets) expect(safeManagedImage(asset, 'preview-local')?.src).toBe(asset.secureUrl);
    expect(safeManagedImage({ ...assets[0], secureUrl: '/illustrations/../../private.svg' }, 'preview-local')).toBeNull();
    expect(safeManagedImage({ ...assets[0], publicId: 'other/waiting' }, 'preview-local')).toBeNull();
    vi.stubEnv('NODE_ENV', 'production');
    for (const asset of assets) expect(safeManagedImage(asset, 'preview-local')).toBeNull();
  });
});
