import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
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
const { seedCore, seedStaff, publicBooking } = await import('../test-support/fixtures.js');
const { default: app } = await import('../src/app.js');
const { default: Appointment } = await import('../src/modules/appointments/appointment.model.js');
const { default: Clinic } = await import('../src/modules/clinic/clinic.model.js');
const { default: Service } = await import('../src/modules/services/service.model.js');
const { default: Dentist } = await import('../src/modules/dentists/dentist.model.js');
const appointmentService = await import('../src/modules/appointments/appointment.service.js');

let core;
let staff;

before(connectTestDatabase);
beforeEach(async () => {
  await clearTestDatabase();
  core = await seedCore();
  staff = await seedStaff();
});
after(disconnectTestDatabase);

const auth = (token) => ({ Authorization: `Bearer ${token}` });
const postPublicBooking = (body, key = randomUUID()) => request(app)
  .post('/api/v1/appointments')
  .set('Idempotency-Key', key)
  .send(body);
const createDirect = (start = '09:00', suffix = '901') => appointmentService.createAppointment(
  publicBooking(core, start, suffix),
);

test('public booking normalizes phone and stores correct timestamps, snapshots, source, and consent', async () => {
  const body = {
    ...publicBooking(core, '09:00', '911'),
    patientPhone: '099 123 456',
    patientComment: 'Please call on arrival',
  };
  const response = await postPublicBooking(body);
  assert.equal(response.status, 201);
  assert.equal(response.body.data.appointment.patientPhone, undefined);
  assert.equal(response.body.data.appointment.patientEmail, undefined);
  assert.equal(response.body.data.appointment.patientComment, undefined);
  assert.equal(response.body.data.appointment.internalNote, undefined);

  const stored = await Appointment.findById(response.body.data.appointment.id).lean();
  assert.equal(stored.patientPhone, '+37499123456');
  assert.equal(stored.startTime, '09:00');
  assert.equal(stored.endTime, '10:00');
  assert.equal(stored.serviceSnapshot.name, 'Professional Cleaning');
  assert.equal(stored.serviceSnapshot.durationMinutes, 60);
  assert.equal(stored.dentistSnapshot.firstName, 'Ani');
  assert.equal(stored.priceSnapshot.priceFrom, 20000);
  assert.equal(stored.source, 'website');
  assert.equal(stored.privacyConsentMethod, 'website');
  assert.equal(stored.privacyPolicyVersion, '2026-01');
  assert.equal(stored.mutationVersion, 0);
  assert.equal(stored.scheduleRevision, 0);
  assert.equal(stored.notificationLocale, 'hy');
  assert.ok(stored.privacyConsentAt instanceof Date);
});

test('privacy consent, valid relations, and configured email requirement are enforced', async () => {
  const withoutConsent = { ...publicBooking(core, '09:00', '921') };
  delete withoutConsent.privacyAccepted;
  assert.equal((await postPublicBooking(withoutConsent)).status, 400);

  await Clinic.updateOne({ key: 'default' }, { $set: { 'bookingSettings.requireEmail': true } });
  const withoutEmail = { ...publicBooking(core, '09:00', '922'), patientEmail: '' };
  const response = await postPublicBooking(withoutEmail);
  assert.equal(response.status, 400);
  assert.match(response.body.message, /Email is required/);
});

test('public booking requires a UUID v4 Idempotency-Key before processing', async () => {
  const payload = publicBooking(core, '09:00', '923');
  const missing = await request(app)
    .post('/api/v1/appointments')
    .send(payload);
  const malformed = await request(app)
    .post('/api/v1/appointments')
    .set('Idempotency-Key', 'predictable-key')
    .send(payload);

  assert.equal(missing.status, 400);
  assert.equal(malformed.status, 400);
  assert.equal(await Appointment.countDocuments(), 0);
});

test('admin phone booking stores source, creator, consent method, and internal note atomically', async () => {
  const response = await request(app)
    .post('/api/v1/appointments/admin')
    .set(auth(staff.receptionistToken))
    .send({
      ...publicBooking(core, '10:00', '931'),
      source: 'phone',
      consentMethod: 'phone',
      internalNote: 'Reception desk booking',
    });
  assert.equal(response.status, 201);
  const stored = await Appointment.findById(response.body.data.appointment._id).lean();
  assert.equal(stored.source, 'phone');
  assert.equal(String(stored.createdBy), String(staff.receptionist._id));
  assert.equal(stored.privacyConsentMethod, 'phone');
  assert.equal(stored.internalNote, 'Reception desk booking');
});

test('appointment snapshots do not change when current service and dentist data changes', async () => {
  const appointment = await createDirect('11:00', '941');
  await Service.updateOne({ _id: core.service._id }, { $set: { name: 'Renamed Service', priceFrom: 99999, durationMinutes: 90 } });
  await Dentist.updateOne({ _id: core.dentist._id }, { $set: { firstName: 'Renamed', title: 'Changed title' } });
  const stored = await Appointment.findById(appointment._id).lean();
  assert.equal(stored.serviceSnapshot.name, 'Professional Cleaning');
  assert.equal(stored.serviceSnapshot.durationMinutes, 60);
  assert.equal(stored.priceSnapshot.priceFrom, 20000);
  assert.equal(stored.dentistSnapshot.firstName, 'Ani');
  assert.equal(stored.dentistSnapshot.title, 'DDS');
});

test('state machine accepts the valid path and rejects transitions from terminal states', async () => {
  const appointment = await createDirect('12:00', '951');
  let expectedMutationVersion = 0;
  for (const status of ['confirmed', 'checked_in', 'in_progress', 'completed']) {
    const response = await request(app)
      .patch(`/api/v1/appointments/${appointment._id}/status`)
      .set(auth(staff.adminToken))
      .send({ status, expectedMutationVersion });
    assert.equal(response.status, 200);
    expectedMutationVersion = response.body.data.appointment.mutationVersion;
  }
  const invalid = await request(app)
    .patch(`/api/v1/appointments/${appointment._id}/status`)
    .set(auth(staff.adminToken))
    .send({ status: 'confirmed', expectedMutationVersion });
  assert.equal(invalid.status, 409);

  const reschedule = await request(app)
    .patch(`/api/v1/appointments/${appointment._id}/reschedule`)
    .set(auth(staff.adminToken))
    .send({
      date: core.date,
      startTime: '14:00',
      expectedMutationVersion,
    });
  assert.equal(reschedule.status, 409);
});

test('concurrent duplicate transitions from one state have exactly one winner', async () => {
  const appointment = await createDirect('13:00', '961');
  const responses = await Promise.all([
    request(app)
      .patch(`/api/v1/appointments/${appointment._id}/status`)
      .set(auth(staff.adminToken))
      .send({ status: 'confirmed', expectedMutationVersion: 0 }),
    request(app)
      .patch(`/api/v1/appointments/${appointment._id}/status`)
      .set(auth(staff.adminToken))
      .send({ status: 'confirmed', expectedMutationVersion: 0 }),
  ]);
  assert.deepEqual(responses.map(({ status }) => status).sort(), [200, 409]);
  const stored = await Appointment.findById(appointment._id).lean();
  assert.equal(stored.status, 'confirmed');
  assert.equal(stored.mutationVersion, 1);
});

test('cancelled and no-show appointments reject invalid transitions and rescheduling', async () => {
  const cancelled = await createDirect('14:00', '971');
  await appointmentService.cancelAppointment(cancelled._id, staff.admin._id, 'Cancelled');
  assert.equal(
    (await request(app)
      .patch(`/api/v1/appointments/${cancelled._id}/status`)
      .set(auth(staff.adminToken))
      .send({ status: 'checked_in', expectedMutationVersion: 1 })).status,
    409,
  );

  const noShow = await createDirect('15:00', '972');
  await appointmentService.updateStatus(noShow._id, 'no_show');
  assert.equal(
    (await request(app)
      .patch(`/api/v1/appointments/${noShow._id}/reschedule`)
      .set(auth(staff.adminToken))
      .send({
        date: core.date,
        startTime: '16:00',
        expectedMutationVersion: 1,
      })).status,
    409,
  );
});

test('maximum bookings per phone per local date is enforced and cancelled bookings do not count', async () => {
  await Clinic.updateOne({ key: 'default' }, { $set: { 'bookingSettings.maxAppointmentsPerPhonePerDay': 1 } });
  const samePhone = publicBooking(core, '09:00', '981');
  assert.equal((await postPublicBooking(samePhone)).status, 201);
  const second = await postPublicBooking({ ...samePhone, startTime: '11:00' });
  assert.equal(second.status, 429);

  const existing = await Appointment.findOne({ patientPhone: samePhone.patientPhone });
  await appointmentService.cancelAppointment(existing._id, staff.admin._id, 'Cancelled');
  assert.equal((await postPublicBooking({ ...samePhone, startTime: '11:00' })).status, 201);
});

test('appointment administration is available to receptionists but denied to dentist-role users', async () => {
  await createDirect('16:00', '991');
  const allowed = await request(app)
    .get('/api/v1/appointments')
    .set(auth(staff.receptionistToken));
  assert.equal(allowed.status, 200, JSON.stringify(allowed.body));
  assert.equal(allowed.headers['cache-control'], 'no-store');
  assert.equal((await request(app).get('/api/v1/appointments').set(auth(staff.dentistToken))).status, 403);
});

test('HTTP appointment mutations require the version the operator reviewed', async () => {
  const appointment = await createDirect('10:00', '992');
  const missing = await request(app)
    .patch(`/api/v1/appointments/${appointment._id}/status`)
    .set(auth(staff.adminToken))
    .send({ status: 'confirmed' });
  assert.equal(missing.status, 400);

  const first = await request(app)
    .patch(`/api/v1/appointments/${appointment._id}/reschedule`)
    .set(auth(staff.adminToken))
    .send({
      expectedMutationVersion: 0,
      date: core.date,
      startTime: '14:00',
    });
  assert.equal(first.status, 200);

  const stale = await request(app)
    .post(`/api/v1/appointments/${appointment._id}/cancel`)
    .set(auth(staff.adminToken))
    .send({
      expectedMutationVersion: 0,
      reason: 'Stale cancellation attempt',
    });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.code, 'APPOINTMENT_VERSION_CONFLICT');
  assert.equal(stale.body.details.currentMutationVersion, 1);

  const stored = await Appointment.findById(appointment._id).lean();
  assert.equal(stored.status, 'pending');
  assert.equal(stored.startTime, '14:00');
});

test('protected reschedule availability excludes only the reviewed appointment locks', async () => {
  const appointment = await createDirect('09:00', '993');
  const allowed = await request(app)
    .get(`/api/v1/appointments/${appointment._id}/availability`)
    .query({
      expectedMutationVersion: 0,
      dentistId: String(core.dentist._id),
      serviceId: String(core.service._id),
      date: core.date,
    })
    .set(auth(staff.receptionistToken));
  assert.equal(allowed.status, 200, JSON.stringify(allowed.body));
  assert.ok(
    allowed.body.data.availability.slots.some(
      ({ start }) => start === '09:00'
    )
  );
  assert.equal(allowed.headers['cache-control'], 'no-store');

  await appointmentService.updateStatus(
    appointment._id,
    'confirmed'
  );
  const stale = await request(app)
    .get(`/api/v1/appointments/${appointment._id}/availability`)
    .query({
      expectedMutationVersion: 0,
      dentistId: String(core.dentist._id),
      serviceId: String(core.service._id),
      date: core.date,
    })
    .set(auth(staff.receptionistToken));
  assert.equal(stale.status, 409);
  assert.equal(stale.body.code, 'APPOINTMENT_VERSION_CONFLICT');

  assert.equal(
    (await request(app)
      .get(`/api/v1/appointments/${appointment._id}/availability`)
      .query({
        expectedMutationVersion: 1,
        dentistId: String(core.dentist._id),
        serviceId: String(core.service._id),
        date: core.date,
      })
      .set(auth(staff.dentistToken))).status,
    403
  );
});

test('appointment list rejects a reversed local-date range', async () => {
  const response = await request(app)
    .get('/api/v1/appointments')
    .query({ from: '2026-08-20', to: '2026-08-19' })
    .set(auth(staff.receptionistToken));
  assert.equal(response.status, 400);
});
