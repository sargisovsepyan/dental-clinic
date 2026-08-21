import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/dental_clinic_test';
process.env.JWT_SECRET = 'test-only-secret-that-is-at-least-thirty-two-characters';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.CLINIC_TIMEZONE = 'America/New_York';

const {
  connectReplTestDatabase: connectTestDatabase,
  clearReplTestDatabase: clearTestDatabase,
  disconnectReplTestDatabase: disconnectTestDatabase,
} = await import('../test-support/replDatabase.js');
const { default: Clinic } = await import('../src/modules/clinic/clinic.model.js');
const { default: ServiceCategory } = await import('../src/modules/serviceCategories/serviceCategory.model.js');
const { default: Service } = await import('../src/modules/services/service.model.js');
const { default: Dentist } = await import('../src/modules/dentists/dentist.model.js');
const clinicService = await import('../src/modules/clinic/clinic.service.js');
const dentistService = await import('../src/modules/dentists/dentist.service.js');
const { getAvailability } = await import('../src/modules/availability/availability.service.js');

before(connectTestDatabase);
beforeEach(clearTestDatabase);
after(disconnectTestDatabase);

test('clinic, dentist, and availability scheduling use configured non-Yerevan timezone', async () => {
  const clinic = await clinicService.getClinic();
  assert.equal(clinic.timezone, 'America/New_York');

  let requested = DateTime.now()
    .setZone('America/New_York')
    .plus({ days: 14 })
    .startOf('day');
  if (requested.weekday === 7) {
    requested = requested.plus({ days: 1 });
  }
  const date = requested.toFormat('yyyy-MM-dd');

  const category = await ServiceCategory.create({
    name: 'Թերապիա',
    slug: 'timezone-therapy',
    translations: { hy: { name: 'Թերապիա' } },
  });
  const service = await Service.create({
    name: 'Խորհրդատվություն',
    slug: 'timezone-consultation',
    category: category._id,
    durationMinutes: 30,
    bookingEnabled: true,
    translations: { hy: { name: 'Խորհրդատվություն' } },
  });
  const dentist = await Dentist.create({
    firstName: 'Անի',
    lastName: 'Հակոբյան',
    slug: 'timezone-dentist',
    title: 'Ատամնաբույժ',
    translations: { hy: { title: 'Ատամնաբույժ' } },
    services: [service._id],
    bookingEnabled: true,
    weeklySchedule: [{
      dayOfWeek: requested.weekday,
      isWorking: true,
      shifts: [{ start: '09:00', end: '12:00' }],
    }],
  });

  await clinicService.upsertClosure(date, {
    expectedScheduleRevision: 0,
    isOpen: true,
    shifts: [{ start: '09:00', end: '12:00' }],
    note: '',
  });
  await dentistService.upsertScheduleException(dentist._id, date, {
    expectedScheduleRevision: 0,
    isWorking: true,
    shifts: [{ start: '09:00', end: '12:00' }],
    note: '',
  });

  // Simulate a stale persisted value from an older deployment. Runtime time
  // calculations must still use the authoritative configuration.
  await Clinic.collection.updateOne(
    { _id: clinic._id },
    { $set: { timezone: 'Asia/Yerevan' } }
  );

  const availability = await getAvailability({
    dentistId: dentist._id,
    serviceId: service._id,
    date,
  });
  assert.equal(
    (await Clinic.findById(clinic._id).lean()).timezone,
    'America/New_York'
  );
  const nine = availability.slots.find(({ start }) => start === '09:00');
  assert.equal(availability.timezone, 'America/New_York');
  assert.ok(nine);
  assert.equal(
    nine.startAt,
    DateTime.fromISO(`${date}T09:00`, {
      zone: 'America/New_York',
    }).toUTC().toISO()
  );
});


test('DST transition dates preserve explicit New York wall-clock slot labels', async () => {
  const clinic = await clinicService.getClinic();
  await Clinic.updateOne(
    { _id: clinic._id },
    {
      $set: {
        weeklySchedule: [{
          dayOfWeek: 7,
          isOpen: true,
          shifts: [{ start: '00:00', end: '12:00' }],
        }],
        'bookingSettings.maxBookingDaysAhead': 365,
        'bookingSettings.minBookingNoticeMinutes': 0,
      },
    }
  );
  const category = await ServiceCategory.create({
    name: 'Ժամային գոտի',
    slug: 'dst-category',
    translations: { hy: { name: 'Ժամային գոտի' } },
  });
  const service = await Service.create({
    name: 'DST ծառայություն',
    slug: 'dst-service',
    category: category._id,
    durationMinutes: 30,
    bookingEnabled: true,
    translations: { hy: { name: 'DST ծառայություն' } },
  });
  const dentist = await Dentist.create({
    firstName: 'Անի',
    lastName: 'Ժամային',
    slug: 'dst-dentist',
    title: 'Ատամնաբույժ',
    translations: { hy: { title: 'Ատամնաբույժ' } },
    services: [service._id],
    bookingEnabled: true,
    weeklySchedule: [{
      dayOfWeek: 7,
      isWorking: true,
      shifts: [{ start: '00:00', end: '12:00' }],
    }],
  });

  const byDate = new Map();
  for (const date of ['2026-11-01', '2027-03-14']) {
    const availability = await getAvailability({
      dentistId: dentist._id,
      serviceId: service._id,
      date,
    });
    const nine = availability.slots.find(({ start }) => start === '09:00');
    assert.ok(nine, `expected a 09:00 slot on ${date}`);
    assert.equal(
      nine.startAt,
      DateTime.fromISO(`${date}T09:00`, {
        zone: 'America/New_York',
      }).toUTC().toISO()
    );
    byDate.set(date, availability.slots.map(({ start }) => start));
  }

  assert.equal(byDate.get('2026-11-01').includes('01:00'), false);
  assert.equal(byDate.get('2026-11-01').includes('01:30'), false);
  assert.equal(byDate.get('2026-11-01').includes('02:00'), true);
  assert.equal(byDate.get('2027-03-14').includes('02:00'), false);
  assert.equal(byDate.get('2027-03-14').includes('02:30'), false);
  assert.equal(byDate.get('2027-03-14').includes('03:00'), true);
});
