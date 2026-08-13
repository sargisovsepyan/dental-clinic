import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/dental_clinic_test';
process.env.JWT_SECRET = 'test-only-secret-that-is-at-least-thirty-two-characters';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.CLINIC_TIMEZONE = 'Asia/Yerevan';

const { connectTestDatabase, clearTestDatabase, disconnectTestDatabase } = await import('../test-support/database.js');
const { seedCore, seedStaff } = await import('../test-support/fixtures.js');
const { default: app } = await import('../src/app.js');

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
      name: 'Surgery',
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
      name: 'Another name',
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
    name: 'Implant Consultation',
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
  await request(app).put(path).set(admin()).send({ isWorking: false, shifts: [], note: 'Leave' }).expect(200);
  let list = await request(app).get(`/api/v1/dentists/${core.dentist._id}/schedule-exceptions`).set(admin());
  assert.equal(list.body.data.exceptions[0].isWorking, false);

  await request(app).put(path).set(admin()).send({
    isWorking: true,
    shifts: [{ start: '12:00', end: '16:00' }],
  }).expect(200);
  list = await request(app).get(`/api/v1/dentists/${core.dentist._id}/schedule-exceptions`).set(admin());
  assert.equal(list.body.data.exceptions[0].shifts[0].start, '12:00');
  await request(app).delete(path).set(admin()).expect(200);
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
    isOpen: true,
    shifts: [{ start: '10:00', end: '14:00' }],
    note: 'Short day',
  }).expect(200);
  const list = await request(app).get('/api/v1/clinic/closures').set(admin());
  assert.equal(list.body.data.closures[0].note, 'Short day');
  await request(app).delete(closurePath).set(admin()).expect(200);
});
