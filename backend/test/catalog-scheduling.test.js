import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/dental_clinic_test';
process.env.JWT_SECRET = 'test-only-secret-that-is-at-least-thirty-two-characters';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.CLINIC_TIMEZONE = 'Asia/Yerevan';

const {
  connectReplTestDatabase: connectTestDatabase,
  clearReplTestDatabase: clearTestDatabase,
  disconnectReplTestDatabase: disconnectTestDatabase,
} = await import('../test-support/replDatabase.js');
const { seedCore, seedStaff } = await import('../test-support/fixtures.js');
const { default: app } = await import('../src/app.js');
const { default: ServiceCategory } = await import('../src/modules/serviceCategories/serviceCategory.model.js');
const { default: Service } = await import('../src/modules/services/service.model.js');
const { default: Dentist } = await import('../src/modules/dentists/dentist.model.js');
const categoryService = await import('../src/modules/serviceCategories/serviceCategory.service.js');
const serviceService = await import('../src/modules/services/service.service.js');
const dentistService = await import('../src/modules/dentists/dentist.service.js');

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

test('category CRUD enforces unique slugs, active public visibility, disable constraints, and restore', async () => {
  const created = await request(app)
    .post('/api/v1/service-categories')
    .set(admin())
    .send({
      translations: {
        hy: { name: 'Վիրաբուժություն' },
        en: { name: 'Surgery' },
      },
    });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.category.slug, 'surgery');

  const duplicate = await request(app)
    .post('/api/v1/service-categories')
    .set(admin())
    .send({
      slug: 'surgery',
      translations: {
        hy: { name: 'Այլ անուն' },
      },
    });
  assert.equal(duplicate.status, 409);

  const blocked = await request(app)
    .delete(`/api/v1/service-categories/${core.category._id}`)
    .set(admin());
  assert.equal(blocked.status, 409);

  await request(app).delete(`/api/v1/services/${core.service._id}`).set(admin()).expect(200);
  const publicDentist = await request(app).get(`/api/v1/dentists/${core.dentist.slug}`);
  assert.deepEqual(publicDentist.body.data.dentist.services, []);
  await request(app).delete(`/api/v1/service-categories/${core.category._id}`).set(admin()).expect(200);
  const publicList = await request(app).get('/api/v1/service-categories');
  assert.equal(publicList.body.data.categories.some(({ slug }) => slug === 'preventive-care'), false);
  const adminList = await request(app).get('/api/v1/service-categories/admin/all').set(admin());
  assert.equal(adminList.body.data.categories.some(({ slug }) => slug === 'preventive-care'), true);
  await request(app).patch(`/api/v1/service-categories/${core.category._id}/restore`).set(admin()).expect(200);
});

test('service creation validates category, pricing combinations, duration, and duplicate slug', async () => {
  const base = {
    slug: 'implant-consultation',
    category: String(core.category._id),
    durationMinutes: 30,
    translations: {
      hy: { name: 'Իմպլանտի խորհրդատվություն' },
      en: { name: 'Implant Consultation' },
    },
  };
  const invalidCategory = await request(app)
    .post('/api/v1/services')
    .set(admin())
    .send({ ...base, category: String(new mongoose.Types.ObjectId()) });
  assert.equal(invalidCategory.status, 400);

  assert.equal((await request(app).post('/api/v1/services').set(admin()).send({ ...base, priceType: 'fixed' })).status, 400);
  assert.equal((await request(app).post('/api/v1/services').set(admin()).send({ ...base, priceType: 'range', priceFrom: 200, priceTo: 100 })).status, 400);
  assert.equal((await request(app).post('/api/v1/services').set(admin()).send({ ...base, durationMinutes: 10 })).status, 400);

  const created = await request(app)
    .post('/api/v1/services')
    .set(admin())
    .send({ ...base, priceType: 'range', priceFrom: 10000, priceTo: 20000 });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.service.priceTo, 20000);
  assert.equal((await request(app).post('/api/v1/services').set(admin()).send({ ...base, priceType: 'on_request' })).status, 409);

  const draft = await request(app)
    .post('/api/v1/services')
    .set(admin())
    .send({
      ...base,
      slug: 'inactive-service-draft',
      translations: {
        hy: { name: 'Ծառայության սևագիր' },
        en: { name: 'Service draft' },
      },
      isActive: false,
      bookingEnabled: true,
      isFeatured: true,
    });
  assert.equal(draft.status, 201);
  assert.equal(draft.body.data.service.isActive, false);
  assert.equal(draft.body.data.service.bookingEnabled, false);
  assert.equal(draft.body.data.service.isFeatured, false);
});

test('service update normalizes price fields and disable/restore respects category activity', async () => {
  const updated = await request(app)
    .patch(`/api/v1/services/${core.service._id}`)
    .set(admin())
    .send({ priceType: 'on_request', priceFrom: 500, priceTo: 800 });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.service.priceFrom, null);
  assert.equal(updated.body.data.service.priceTo, null);

  await request(app).delete(`/api/v1/services/${core.service._id}`).set(admin()).expect(200);
  await request(app).delete(`/api/v1/service-categories/${core.category._id}`).set(admin()).expect(200);
  assert.equal((await request(app).patch(`/api/v1/services/${core.service._id}/restore`).set(admin())).status, 400);
  await request(app).patch(`/api/v1/service-categories/${core.category._id}/restore`).set(admin()).expect(200);
  await request(app).patch(`/api/v1/services/${core.service._id}/restore`).set(admin()).expect(200);
});

test('dentist creation validates service relations, duplicate weekdays, shift order, and overlap', async () => {
  const base = {
    firstName: 'Mariam',
    lastName: 'Petrosyan',
    services: [String(core.service._id)],
    translations: {
      hy: { title: 'Ատամնաբույժ' },
      en: { title: 'Dentist' },
    },
    weeklySchedule: [{
      dayOfWeek: 1,
      isWorking: true,
      shifts: [{ start: '09:00', end: '13:00' }, { start: '14:00', end: '18:00' }],
    }],
  };
  assert.equal((await request(app).post('/api/v1/dentists').set(admin()).send({ ...base, services: [String(new mongoose.Types.ObjectId())] })).status, 400);
  assert.equal((await request(app).post('/api/v1/dentists').set(admin()).send({
    ...base,
    weeklySchedule: [{ dayOfWeek: 1, isWorking: true, shifts: [{ start: '10:00', end: '09:00' }] }],
  })).status, 400);
  assert.equal((await request(app).post('/api/v1/dentists').set(admin()).send({
    ...base,
    weeklySchedule: [{ dayOfWeek: 1, isWorking: true, shifts: [{ start: '09:00', end: '12:00' }, { start: '11:00', end: '14:00' }] }],
  })).status, 400);
  assert.equal((await request(app).post('/api/v1/dentists').set(admin()).send({
    ...base,
    weeklySchedule: [base.weeklySchedule[0], base.weeklySchedule[0]],
  })).status, 400);

  const created = await request(app).post('/api/v1/dentists').set(admin()).send(base);
  assert.equal(created.status, 201);
  assert.deepEqual(created.body.data.dentist.weeklySchedule[0].shifts.map(({ start }) => start), ['09:00', '14:00']);
});

test('dentist schedule exceptions support day off, altered hours, listing, and deletion', async () => {
  const path = `/api/v1/dentists/${core.dentist._id}/schedule-exceptions/${core.date}`;
  await request(app).put(path).set(admin()).send({
    expectedScheduleRevision: 0,
    isWorking: false,
    shifts: [],
    note: 'Leave',
  }).expect(200);
  let list = await request(app).get(`/api/v1/dentists/${core.dentist._id}/schedule-exceptions`).set(admin());
  assert.equal(list.body.data.exceptions[0].isWorking, false);

  await request(app).put(path).set(admin()).send({
    expectedScheduleRevision: 1,
    isWorking: true,
    shifts: [{ start: '12:00', end: '16:00' }],
  }).expect(200);
  list = await request(app).get(`/api/v1/dentists/${core.dentist._id}/schedule-exceptions`).set(admin());
  assert.equal(list.body.data.exceptions[0].shifts[0].start, '12:00');
  await request(app)
    .delete(path)
    .query({ expectedScheduleRevision: 2 })
    .set(admin())
    .expect(200);
});

test('clinic settings reject overlapping hours and closure endpoints support altered hours and deletion', async () => {
  const invalid = await request(app)
    .patch('/api/v1/clinic')
    .set(admin())
    .send({
      weeklySchedule: [{
        dayOfWeek: 1,
        isOpen: true,
        shifts: [{ start: '09:00', end: '13:00' }, { start: '12:00', end: '15:00' }],
      }],
    });
  assert.equal(invalid.status, 400);

  const updated = await request(app)
    .patch('/api/v1/clinic')
    .set(admin())
    .send({ bookingSettings: { slotIntervalMinutes: 20, bufferMinutes: 10 } });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.clinic.bookingSettings.slotIntervalMinutes, 20);

  const closurePath = `/api/v1/clinic/closures/${core.date}`;
  await request(app).put(closurePath).set(admin()).send({
    expectedScheduleRevision: 0,
    isOpen: true,
    shifts: [{ start: '10:00', end: '14:00' }],
    note: 'Short day',
  }).expect(200);
  const list = await request(app).get('/api/v1/clinic/closures').set(admin());
  assert.equal(list.body.data.closures[0].note, 'Short day');
  await request(app)
    .delete(closurePath)
    .query({ expectedScheduleRevision: 1 })
    .set(admin())
    .expect(200);
});

test('schedule exception list endpoints reject reversed date ranges', async () => {
  const query = { from: '2026-08-20', to: '2026-08-19' };
  assert.equal(
    (await request(app)
      .get('/api/v1/clinic/closures')
      .query(query)
      .set(admin())).status,
    400
  );
  assert.equal(
    (await request(app)
      .get(`/api/v1/dentists/${core.dentist._id}/schedule-exceptions`)
      .query(query)
      .set(admin())).status,
    400
  );
});

test('generic catalog patches cannot bypass dedicated lifecycle or slug rules', async () => {
  await request(app)
    .patch(`/api/v1/service-categories/${core.category._id}`)
    .set(admin())
    .send({ sortOrder: 999, isActive: false })
    .expect(400);
  await request(app)
    .patch(`/api/v1/services/${core.service._id}`)
    .set(admin())
    .send({ sortOrder: 999, isActive: false })
    .expect(400);
  await request(app)
    .patch(`/api/v1/dentists/${core.dentist._id}`)
    .set(admin())
    .send({ sortOrder: 999, isActive: false })
    .expect(400);
  await request(app)
    .patch(`/api/v1/services/${core.service._id}`)
    .set(admin())
    .send({ sortOrder: 999, slug: 'changed-behind-the-scenes' })
    .expect(400);

  const category = await ServiceCategory.findById(core.category._id);
  const service = await Service.findById(core.service._id);
  const dentist = await Dentist.findById(core.dentist._id);
  assert.equal(category.isActive, true);
  assert.notEqual(category.sortOrder, 999);
  assert.equal(service.isActive, true);
  assert.notEqual(service.sortOrder, 999);
  assert.equal(dentist.isActive, true);
  assert.notEqual(dentist.sortOrder, 999);
});

test('disable and restore clear stale booking and featured flags', async () => {
  await Service.updateOne(
    { _id: core.service._id },
    { $set: { bookingEnabled: true, isFeatured: true } }
  );
  await request(app)
    .delete(`/api/v1/services/${core.service._id}`)
    .set(admin())
    .expect(200);
  let service = await Service.findById(core.service._id).lean();
  assert.equal(service.bookingEnabled, false);
  assert.equal(service.isFeatured, false);
  await request(app)
    .patch(`/api/v1/services/${core.service._id}/restore`)
    .set(admin())
    .expect(200);
  service = await Service.findById(core.service._id).lean();
  assert.equal(service.bookingEnabled, false);
  assert.equal(service.isFeatured, false);

  await Dentist.updateOne(
    { _id: core.dentist._id },
    { $set: { bookingEnabled: true, isFeatured: true } }
  );
  await request(app)
    .delete(`/api/v1/dentists/${core.dentist._id}`)
    .set(admin())
    .expect(200);
  let dentist = await Dentist.findById(core.dentist._id).lean();
  assert.equal(dentist.bookingEnabled, false);
  assert.equal(dentist.isFeatured, false);
  await request(app)
    .patch(`/api/v1/dentists/${core.dentist._id}/restore`)
    .set(admin())
    .expect(200);
  dentist = await Dentist.findById(core.dentist._id).lean();
  assert.equal(dentist.bookingEnabled, false);
  assert.equal(dentist.isFeatured, false);
});

test('stale enabling updates lose deterministically to service and dentist disables', async () => {
  const freezeEnablingCas = (Model, id) => {
    const original = Model.findOneAndUpdate;
    let reachedCas;
    let releaseCas;
    const reached = new Promise((resolve) => { reachedCas = resolve; });
    const release = new Promise((resolve) => { releaseCas = resolve; });

    Model.findOneAndUpdate = function (filter, update, options) {
      if (
        String(filter?._id) !== String(id) ||
        filter?.isActive !== true
      ) {
        return original.call(this, filter, update, options);
      }

      reachedCas();
      return {
        populate: async (...populateArgs) => {
          await release;
          return original
            .call(Model, filter, update, options)
            .populate(...populateArgs);
        },
      };
    };

    return {
      reached,
      release: releaseCas,
      restore: () => { Model.findOneAndUpdate = original; },
    };
  };

  const serviceGate = freezeEnablingCas(Service, core.service._id);
  try {
    const staleUpdate = serviceService.updateService(core.service._id, {
      bookingEnabled: true,
      isFeatured: true,
    });
    await serviceGate.reached;
    await serviceService.deleteService(core.service._id);
    serviceGate.release();
    await assert.rejects(staleUpdate, { statusCode: 409 });
  }
  finally {
    serviceGate.release();
    serviceGate.restore();
  }

  let service = await Service.findById(core.service._id).lean();
  assert.equal(service.isActive, false);
  assert.equal(service.bookingEnabled, false);
  assert.equal(service.isFeatured, false);

  await serviceService.restoreService(core.service._id);
  const dentistGate = freezeEnablingCas(Dentist, core.dentist._id);
  try {
    const staleUpdate = dentistService.updateDentist(core.dentist._id, {
      bookingEnabled: true,
      isFeatured: true,
    });
    await dentistGate.reached;
    await dentistService.disableDentist(core.dentist._id);
    dentistGate.release();
    await assert.rejects(staleUpdate, { statusCode: 409 });
  }
  finally {
    dentistGate.release();
    dentistGate.restore();
  }

  const dentist = await Dentist.findById(core.dentist._id).lean();
  assert.equal(dentist.isActive, false);
  assert.equal(dentist.bookingEnabled, false);
  assert.equal(dentist.isFeatured, false);
});

test('category disable and service restore serialize on the category write guard', async () => {
  await serviceService.deleteService(core.service._id);

  const results = await Promise.allSettled([
    categoryService.deleteCategory(core.category._id),
    serviceService.restoreService(core.service._id),
  ]);
  assert.equal(results.filter(({ status }) => status === 'fulfilled').length, 1);

  const category = await ServiceCategory.findById(core.category._id).lean();
  const service = await Service.findById(core.service._id).lean();
  assert.equal(category.isActive === false && service.isActive === true, false);
});

test('category disable and service create serialize on the category write guard', async () => {
  await serviceService.deleteService(core.service._id);

  const results = await Promise.allSettled([
    categoryService.deleteCategory(core.category._id),
    serviceService.createService({
      category: core.category._id,
      slug: 'guarded-concurrent-service',
      translations: {
        hy: { name: 'Զուգահեռ ծառայություն' },
      },
      priceType: 'on_request',
      durationMinutes: 30,
    }),
  ]);
  assert.equal(results.filter(({ status }) => status === 'fulfilled').length, 1);

  const category = await ServiceCategory.findById(core.category._id).lean();
  const created = await Service.findOne({ slug: 'guarded-concurrent-service' }).lean();
  assert.equal(category.isActive === false && created?.isActive === true, false);
});

test('inactive or missing service categories fail closed across public catalog, dentists, and availability', async () => {
  await ServiceCategory.collection.updateOne(
    { _id: core.category._id },
    { $set: { isActive: false } }
  );

  const list = await request(app).get('/api/v1/services');
  assert.equal(
    list.body.data.services.some(({ _id }) => _id === String(core.service._id)),
    false
  );
  await request(app)
    .get(`/api/v1/services/${core.service.slug}`)
    .expect(404);
  const dentists = await request(app)
    .get(`/api/v1/dentists?service=${core.service._id}`);
  assert.deepEqual(dentists.body.data.dentists, []);
  await request(app)
    .get('/api/v1/availability')
    .query({
      dentistId: String(core.dentist._id),
      serviceId: String(core.service._id),
      date: core.date,
    })
    .expect(404);

  await ServiceCategory.collection.deleteOne({ _id: core.category._id });
  await request(app)
    .get(`/api/v1/services/${core.service.slug}`)
    .expect(404);
});

test('Armenian slugs are useful, deterministic, stable, canonical, and collision-safe', async () => {
  const create = (name, extra = {}) => request(app)
    .post('/api/v1/service-categories')
    .set(admin())
    .send({
      translations: { hy: { name } },
      ...extra,
    });

  const surgery = await create('Վիրաբուժություն');
  const restoration = await create('Վերականգնում');
  assert.equal(surgery.status, 201);
  assert.equal(restoration.status, 201);
  assert.equal(surgery.body.data.category.slug, 'virabouzhoutyoun');
  assert.equal(restoration.body.data.category.slug, 'verakangnoum');
  assert.notEqual(surgery.body.data.category.slug, restoration.body.data.category.slug);

  const stableSlug = surgery.body.data.category.slug;
  const edited = await request(app)
    .patch(`/api/v1/service-categories/${surgery.body.data.category._id}`)
    .set(admin())
    .send({ translations: { hy: { name: 'Վիրաբուժական ծառայություն' } } });
  assert.equal(edited.body.data.category.slug, stableSlug);

  for (const slug of ['foo/bar', 'bad?query', 'javascript:alert', '--', 'a']) {
    assert.equal((await create('Անվավեր հղում', { slug })).status, 400);
  }

  const duplicatePayload = {
    slug: 'concurrent-canonical-slug',
    translations: { hy: { name: 'Կրկնվող անվանում' } },
  };
  const duplicates = await Promise.all([
    request(app).post('/api/v1/service-categories').set(admin()).send(duplicatePayload),
    request(app).post('/api/v1/service-categories').set(admin()).send(duplicatePayload),
  ]);
  assert.deepEqual(duplicates.map(({ status }) => status).sort(), [201, 409]);
});

test('legacy public image URL fields are read-only and clinic links require approved HTTPS URLs', async () => {
  await request(app)
    .patch(`/api/v1/service-categories/${core.category._id}`)
    .set(admin())
    .send({ sortOrder: 999, imageUrl: 'https://example.com/category.jpg' })
    .expect(400);
  await request(app)
    .patch(`/api/v1/services/${core.service._id}`)
    .set(admin())
    .send({ sortOrder: 999, imageUrl: 'https://example.com/service.jpg' })
    .expect(400);
  await request(app)
    .patch(`/api/v1/dentists/${core.dentist._id}`)
    .set(admin())
    .send({ sortOrder: 999, photoUrl: 'https://example.com/dentist.jpg' })
    .expect(400);

  assert.notEqual((await ServiceCategory.findById(core.category._id)).sortOrder, 999);
  assert.notEqual((await Service.findById(core.service._id)).sortOrder, 999);
  assert.notEqual((await Dentist.findById(core.dentist._id)).sortOrder, 999);

  for (const unsafe of [
    'javascript:alert(1)',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'data:text/html,x',
    'ftp://example.com/map',
    'http://example.com/map',
  ]) {
    await request(app)
      .patch('/api/v1/clinic')
      .set(admin())
      .send({ mapUrl: unsafe })
      .expect(400);
    await request(app)
      .patch('/api/v1/clinic')
      .set(admin())
      .send({ socialLinks: { instagram: unsafe } })
      .expect(400);
  }

  await request(app)
    .patch('/api/v1/clinic')
    .set(admin())
    .send({
      mapUrl: 'https://maps.example.com/clinic',
      socialLinks: {
        instagram: 'https://www.instagram.com/example_clinic',
        facebook: 'https://www.facebook.com/example.clinic',
        whatsapp: 'https://wa.me/37499123456',
        telegram: 'https://t.me/example_clinic',
      },
    })
    .expect(200);
  await request(app)
    .patch('/api/v1/clinic')
    .set(admin())
    .send({ socialLinks: { telegram: 'https://evil.example/clinic' } })
    .expect(400);
});
