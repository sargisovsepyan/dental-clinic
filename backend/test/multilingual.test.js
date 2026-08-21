import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/dental_clinic_test';
process.env.JWT_SECRET = 'test-only-secret-that-is-at-least-thirty-two-characters';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.CLINIC_TIMEZONE = 'Asia/Yerevan';

const { connectTestDatabase, clearTestDatabase, disconnectTestDatabase } = await import('../test-support/database.js');
const { seedCore, seedStaff } = await import('../test-support/fixtures.js');
const { default: app } = await import('../src/app.js');
const { default: ServiceCategory } = await import('../src/modules/serviceCategories/serviceCategory.model.js');
const localizedContentMigration = await import('../src/migrations/20260814_001_localized_content.js');

let core;
let staff;

before(connectTestDatabase);
beforeEach(async () => {
  await clearTestDatabase();
  core = await seedCore();
  staff = await seedStaff();
});
after(disconnectTestDatabase);

const admin = () => ({ Authorization: `Bearer ${staff.adminToken}` });

test('catalog rejects conflicting legacy/HY input and exposes explicit hy, ru, and en translations', async () => {
  const conflicting = await request(app)
    .post('/api/v1/service-categories')
    .set(admin())
    .send({
      name: 'Conflicting legacy label',
      slug: 'localized-category',
      translations: {
        hy: {
          name: 'Թերապիա',
          description: 'Հայերեն նկարագրություն',
        },
        ru: {
          name: 'Терапия',
          description: 'Описание',
        },
        en: {
          name: 'Therapy',
          description: 'Description',
        },
      },
    });

  assert.equal(conflicting.status, 400);

  const response = await request(app)
    .post('/api/v1/service-categories')
    .set(admin())
    .send({
      slug: 'localized-category',
      translations: {
        hy: {
          name: 'Թերապիա',
          description: 'Հայերեն նկարագրություն',
        },
        ru: {
          name: 'Терапия',
          description: 'Описание',
        },
        en: {
          name: 'Therapy',
          description: 'Description',
        },
      },
    });

  assert.equal(response.status, 201);
  assert.equal(response.body.data.category.name, 'Թերապիա');
  assert.equal(response.body.data.category.translations.hy.name, 'Թերապիա');
  assert.deepEqual(
    Object.keys(response.body.data.category.translations).sort(),
    ['en', 'hy', 'ru'],
  );

  const publicList = await request(app).get('/api/v1/service-categories');
  const publicItem = publicList.body.data.categories.find(({ slug }) => slug === 'localized-category');
  assert.equal(publicItem.translations.ru.name, 'Терапия');

  const adminList = await request(app)
    .get('/api/v1/service-categories/admin/all')
    .set(admin());
  assert.equal(
    adminList.body.data.categories.find(({ slug }) => slug === 'localized-category').translations.en.name,
    'Therapy',
  );
});

test('unsupported translation locales and active records without Armenian content are rejected', async () => {
  const unsupported = await request(app)
    .post('/api/v1/service-categories')
    .set(admin())
    .send({
      slug: 'unsupported',
      translations: {
        hy: { name: 'Վավեր' },
        fr: { name: 'Interdit' },
      },
    });
  assert.equal(unsupported.status, 400);

  const missingPrimary = await request(app)
    .post('/api/v1/service-categories')
    .set(admin())
    .send({
      slug: 'missing-primary',
      translations: {
        en: { name: 'English only' },
      },
    });
  assert.equal(missingPrimary.status, 400);

  const draft = await request(app)
    .post('/api/v1/service-categories')
    .set(admin())
    .send({
      slug: 'english-draft',
      isActive: false,
      translations: {
        en: { name: 'English draft' },
      },
    });
  assert.equal(draft.status, 201);

  const publish = await request(app)
    .patch(`/api/v1/service-categories/${draft.body.data.category._id}/restore`)
    .set(admin());
  assert.equal(publish.status, 400);
});

test('partial locale updates preserve other locales and language-neutral fields', async () => {
  const categorySlug = core.category.slug;
  const originalSlug = core.service.slug;
  const originalPrice = core.service.priceFrom;
  const originalDuration = core.service.durationMinutes;

  const update = await request(app)
    .patch(`/api/v1/services/${core.service._id}`)
    .set(admin())
    .send({
      translations: {
        ru: {
          name: 'Профессиональная чистка',
          description: 'Русское описание',
        },
      },
    });

  assert.equal(update.status, 200);
  assert.equal(update.body.data.service.translations.hy.name, 'Պրոֆեսիոնալ մաքրում');
  assert.equal(update.body.data.service.translations.ru.name, 'Профессиональная чистка');
  assert.equal(update.body.data.service.translations.en.name, 'Professional Cleaning');
  assert.equal(update.body.data.service.slug, originalSlug);
  assert.equal(update.body.data.service.priceFrom, originalPrice);
  assert.equal(update.body.data.service.durationMinutes, originalDuration);

  const legacyCompatibility = await request(app)
    .patch(`/api/v1/services/${core.service._id}`)
    .set(admin())
    .send({ shortDescription: 'Կարճ հայերեն նկարագրություն' });
  assert.equal(legacyCompatibility.status, 200);
  assert.equal(legacyCompatibility.body.data.service.shortDescription, 'Կարճ հայերեն նկարագրություն');
  assert.equal(
    legacyCompatibility.body.data.service.translations.hy.shortDescription,
    'Կարճ հայերեն նկարագրություն',
  );
  assert.equal(legacyCompatibility.body.data.service.translations.ru.name, 'Профессиональная чистка');

  const neutralOnly = await request(app)
    .patch(`/api/v1/services/${core.service._id}`)
    .set(admin())
    .send({ sortOrder: 9 });
  assert.equal(neutralOnly.status, 200);
  assert.equal(neutralOnly.body.data.service.translations.ru.name, 'Профессиональная чистка');

  const category = await request(app)
    .patch(`/api/v1/service-categories/${core.category._id}`)
    .set(admin())
    .send({
      translations: {
        ru: { name: 'Профилактика' },
      },
    });
  assert.equal(category.status, 200);
  assert.equal(category.body.data.category.slug, categorySlug);
  assert.equal(category.body.data.category.translations.en.name, 'Preventive Care');

  const dentist = await request(app)
    .patch(`/api/v1/dentists/${core.dentist._id}`)
    .set(admin())
    .send({
      translations: {
        ru: {
          title: 'Стоматолог',
          specializations: ['Терапия'],
        },
      },
    });
  assert.equal(dentist.status, 200);
  assert.equal(dentist.body.data.dentist.translations.hy.title, 'Ատամնաբույժ');
  assert.deepEqual(dentist.body.data.dentist.translations.ru.specializations, ['Терапия']);

  const clinic = await request(app)
    .patch('/api/v1/clinic')
    .set(admin())
    .send({
      translations: {
        ru: { clinicName: 'Стоматологическая клиника' },
        en: { tagline: 'Care with confidence' },
      },
    });
  assert.equal(clinic.status, 200);
  assert.equal(clinic.body.data.clinic.translations.hy.clinicName, 'Ատամնաբուժական կլինիկա');
  assert.equal(clinic.body.data.clinic.translations.ru.clinicName, 'Стоматологическая клиника');
  assert.equal(clinic.body.data.clinic.bookingSettings.maxAppointmentsPerPhonePerDay, 20);
});

test('HY mirrors remain authoritative and concurrent RU/EN patches preserve both locales', async () => {
  const originalSlug = core.service.slug;
  const hyName = 'Թարմացված հայկական անուն';
  const hyUpdate = await request(app)
    .patch(`/api/v1/services/${core.service._id}`)
    .set(admin())
    .send({ translations: { hy: { name: hyName } } });
  assert.equal(hyUpdate.status, 200);
  assert.equal(hyUpdate.body.data.service.name, hyName);
  assert.equal(hyUpdate.body.data.service.slug, originalSlug);

  const compatibilityName = 'Համատեղելի հայկական անուն';
  const compatibilityUpdate = await request(app)
    .patch(`/api/v1/services/${core.service._id}`)
    .set(admin())
    .send({ name: compatibilityName });
  assert.equal(compatibilityUpdate.status, 200);
  assert.equal(
    compatibilityUpdate.body.data.service.translations.hy.name,
    compatibilityName
  );
  assert.equal(compatibilityUpdate.body.data.service.slug, originalSlug);

  const [ru, en] = await Promise.all([
    request(app)
      .patch(`/api/v1/services/${core.service._id}`)
      .set(admin())
      .send({ translations: { ru: { name: 'Параллельное русское имя' } } }),
    request(app)
      .patch(`/api/v1/services/${core.service._id}`)
      .set(admin())
      .send({ translations: { en: { name: 'Concurrent English Name' } } }),
  ]);
  assert.equal(ru.status, 200);
  assert.equal(en.status, 200);

  const final = await request(app)
    .get(`/api/v1/services/${originalSlug}`);
  assert.equal(final.body.data.service.translations.ru.name, 'Параллельное русское имя');
  assert.equal(final.body.data.service.translations.en.name, 'Concurrent English Name');
  assert.equal(final.body.data.service.name, compatibilityName);
});

test('legacy migration is explicit, dry-run safe, idempotent, and preserves original fields', async () => {
  const inserted = await ServiceCategory.collection.insertOne({
    name: 'Legacy English Name',
    slug: 'legacy-stable-slug',
    description: 'Legacy English Description',
    isActive: true,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const dryRun = await localizedContentMigration.run({
    legacyLocale: 'en',
    dryRun: true,
  });
  assert.equal(dryRun.serviceCategories.changed, 1);
  assert.equal(
    (await ServiceCategory.collection.findOne({ _id: inserted.insertedId })).translations,
    undefined,
  );

  const applied = await localizedContentMigration.run({
    legacyLocale: 'en',
    dryRun: false,
  });
  assert.equal(applied.serviceCategories.changed, 1);

  const migrated = await ServiceCategory.collection.findOne({ _id: inserted.insertedId });
  assert.equal(migrated.translations.en.name, 'Legacy English Name');
  assert.equal(migrated.translations.hy, undefined);
  assert.equal(migrated.name, 'Legacy English Name');
  assert.equal(migrated.slug, 'legacy-stable-slug');

  const rerun = await localizedContentMigration.run({
    legacyLocale: 'en',
    dryRun: false,
  });
  assert.equal(rerun.serviceCategories.changed, 0);

  await assert.rejects(
    localizedContentMigration.run({ legacyLocale: 'fr' }),
    /must be one of hy, ru, en/,
  );
});

test('legacy localization migration never overwrites a concurrent editorial translation', async () => {
  const inserted = await ServiceCategory.collection.insertOne({
    name: 'Legacy Source Name',
    slug: 'legacy-concurrent-source',
    description: 'Legacy Source Description',
    isActive: true,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  let mutated = false;

  const applied = await localizedContentMigration.run({
    legacyLocale: 'en',
    dryRun: false,
    beforeDocumentWrite: async ({ document }) => {
      if (mutated || String(document._id) !== String(inserted.insertedId)) {
        return;
      }
      mutated = true;
      await ServiceCategory.collection.updateOne(
        { _id: inserted.insertedId },
        {
          $set: {
            name: 'Concurrent Legacy Name',
            'translations.en.name': 'Concurrent Authored Name',
          },
        }
      );
    },
  });

  const stored = await ServiceCategory.collection.findOne({
    _id: inserted.insertedId,
  });
  assert.equal(applied.serviceCategories.changed, 1);
  assert.equal(stored.name, 'Concurrent Legacy Name');
  assert.equal(stored.translations.en.name, 'Concurrent Authored Name');
  assert.equal(
    stored.translations.en.description,
    'Legacy Source Description'
  );
});
