import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { DateTime } from 'luxon';

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
const { seedCore, futureDate, publicBooking } = await import('../test-support/fixtures.js');
const availabilityService = await import('../src/modules/availability/availability.service.js');
const appointmentService = await import('../src/modules/appointments/appointment.service.js');
const clinicService = await import('../src/modules/clinic/clinic.service.js');
const { default: Clinic } = await import('../src/modules/clinic/clinic.model.js');
const { default: ClinicClosure } = await import('../src/modules/clinic/clinicClosure.model.js');
const { default: DentistScheduleException } = await import('../src/modules/dentists/dentistScheduleException.model.js');
const { default: Dentist } = await import('../src/modules/dentists/dentist.model.js');
const { default: Service } = await import('../src/modules/services/service.model.js');

let core;

before(connectTestDatabase);
beforeEach(async () => {
  await clearTestDatabase();
  core = await seedCore();
});
after(disconnectTestDatabase);

const getAvailability = (overrides = {}) => availabilityService.getAvailability({
  dentistId: core.dentist._id,
  serviceId: core.service._id,
  date: core.date,
  ...overrides,
});

const starts = (availability) => availability.slots.map((slot) => slot.start);

test('availability respects lunch breaks and exact schedule boundaries', async () => {
  await clearTestDatabase();
  core = await seedCore({
    clinicShifts: [{ start: '09:00', end: '13:00' }, { start: '14:00', end: '18:00' }],
    dentistShifts: [{ start: '09:00', end: '13:00' }, { start: '14:00', end: '18:00' }],
  });
  const result = await getAvailability();
  const slotStarts = starts(result);
  for (const expected of ['09:00', '12:00', '14:00', '17:00']) {
    assert.ok(slotStarts.includes(expected));
  }
  for (const crossing of ['12:30', '17:30']) {
    assert.equal(slotStarts.includes(crossing), false);
  }
});

test('slot interval can differ from duration without crossing closing time', async () => {
  await clearTestDatabase();
  core = await seedCore({
    durationMinutes: 45,
    slotIntervalMinutes: 30,
    clinicShifts: [{ start: '09:00', end: '11:00' }],
    dentistShifts: [{ start: '09:00', end: '11:00' }],
  });
  assert.deepEqual(starts(await getAvailability()), ['09:00', '09:30', '10:00']);
});

test('trailing buffer must fit within the intersected working window', async () => {
  await clearTestDatabase();
  core = await seedCore({
    bufferMinutes: 30,
    clinicShifts: [{ start: '09:00', end: '13:00' }],
    dentistShifts: [{ start: '09:00', end: '13:00' }],
  });
  const slotStarts = starts(await getAvailability());
  assert.ok(slotStarts.includes('11:30'));
  assert.equal(slotStarts.includes('12:00'), false);
});

test('clinic closure and altered hours override the weekly schedule', async () => {
  await ClinicClosure.create({ date: core.date, isOpen: false, shifts: [] });
  const closed = await getAvailability();
  assert.equal(closed.reason, 'CLINIC_CLOSED');
  assert.deepEqual(closed.slots, []);

  await ClinicClosure.updateOne(
    { date: core.date },
    { $set: { isOpen: true, shifts: [{ start: '10:00', end: '12:00' }] } },
    { runValidators: true },
  );
  assert.deepEqual(starts(await getAvailability()), ['10:00', '10:30', '11:00']);
});

test('dentist day-off and altered-hours exceptions override weekly hours', async () => {
  await DentistScheduleException.create({
    dentist: core.dentist._id,
    date: core.date,
    isWorking: false,
    shifts: [],
  });
  assert.equal((await getAvailability()).reason, 'DENTIST_NOT_WORKING');

  await DentistScheduleException.updateOne(
    { dentist: core.dentist._id, date: core.date },
    { $set: { isWorking: true, shifts: [{ start: '15:00', end: '17:00' }] } },
    { runValidators: true },
  );
  assert.deepEqual(starts(await getAvailability()), ['15:00', '15:30', '16:00']);
});

test('past dates, invalid dates, and dates beyond the booking horizon are rejected', async () => {
  await assert.rejects(
    getAvailability({ date: futureDate(-1) }),
    (error) => error.statusCode === 400 && /past/.test(error.message),
  );
  await assert.rejects(
    getAvailability({ date: '2027-02-30' }),
    (error) => error.statusCode === 400 && /calendar/.test(error.message),
  );
  await assert.rejects(
    getAvailability({ date: futureDate(61) }),
    (error) => error.statusCode === 400 && /days ahead/.test(error.message),
  );
});

test('same-day setting and minimum notice are enforced in clinic local time', async () => {
  const today = DateTime.now().setZone('Asia/Yerevan').toFormat('yyyy-MM-dd');
  await Clinic.updateOne(
    { key: 'default' },
    { $set: { 'bookingSettings.allowSameDayBooking': false } },
  );
  assert.equal((await getAvailability({ date: today })).reason, 'SAME_DAY_BOOKING_DISABLED');

  await Clinic.updateOne(
    { key: 'default' },
    {
      $set: {
        'bookingSettings.allowSameDayBooking': true,
        'bookingSettings.minBookingNoticeMinutes': 10080,
      },
    },
  );
  assert.equal((await getAvailability({ date: today })).slots.length, 0);
});

test('inactive or unbookable resources and wrong dentist-service relations are rejected', async () => {
  await Service.updateOne({ _id: core.service._id }, { $set: { isActive: false } });
  await assert.rejects(getAvailability(), (error) => error.statusCode === 404);
  await Service.updateOne({ _id: core.service._id }, { $set: { isActive: true } });

  await Dentist.updateOne({ _id: core.dentist._id }, { $set: { bookingEnabled: false } });
  await assert.rejects(getAvailability(), (error) => error.statusCode === 404);
  await Dentist.updateOne({ _id: core.dentist._id }, { $set: { bookingEnabled: true, services: [] } });
  await assert.rejects(getAvailability(), (error) => error.statusCode === 400);
});

test('active appointments occupy slots while cancellation releases them', async () => {
  const appointment = await appointmentService.createAppointment(publicBooking(core, '09:00', '811'));
  assert.equal(starts(await getAvailability()).includes('09:00'), false);
  await appointmentService.cancelAppointment(
    appointment._id,
    new mongoose.Types.ObjectId(),
    'Test cancellation',
  );
  assert.equal(starts(await getAvailability()).includes('09:00'), true);
});

test('local appointment times are converted to internally consistent UTC timestamps', async () => {
  const result = await getAvailability();
  const nine = result.slots.find((slot) => slot.start === '09:00');
  const expected = DateTime.fromISO(`${core.date}T09:00`, { zone: 'Asia/Yerevan' }).toUTC().toISO();
  assert.equal(nine.startAt, expected);
  assert.equal(DateTime.fromISO(nine.startAt).setZone('Asia/Yerevan').toFormat('yyyy-MM-dd HH:mm'), `${core.date} 09:00`);
});

test('clinic singleton initialization is atomic and honors the configured timezone', async () => {
  await Clinic.deleteMany({});
  const clinics = await Promise.all(Array.from({ length: 6 }, () => clinicService.getClinic()));
  assert.equal(await Clinic.countDocuments({ key: 'default' }), 1);
  assert.ok(clinics.every((clinic) => clinic.timezone === 'Asia/Yerevan'));
  assert.ok(clinics.every((clinic) => clinic.translations.hy.clinicName));
});
