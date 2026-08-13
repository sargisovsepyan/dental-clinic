import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/dental_clinic_test';
process.env.JWT_SECRET = 'test-only-secret-that-is-at-least-thirty-two-characters';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.CLINIC_TIMEZONE = 'Asia/Yerevan';

const { connectTestDatabase, clearTestDatabase, disconnectTestDatabase } = await import('../test-support/database.js');
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
const createDirect = (start = '09:00', suffix = '901') => appointmentService.createAppointment(
  publicBooking(core, start, suffix),
);

test('public booking normalizes phone and stores correct timestamps, snapshots, source, and consent', async () => {
  const body = {
    ...publicBooking(core, '09:00', '911'),
    patientPhone: '099 123 456',
    patientComment: 'Please call on arrival',
  };
  const response = await request(app).post('/api/v1/appointments').send(body);
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
  assert.ok(stored.privacyConsentAt instanceof Date);
});

test('privacy consent, valid relations, and configured email requirement are enforced', async () => {
  const withoutConsent = { ...publicBooking(core, '09:00', '921') };
  delete withoutConsent.privacyAccepted;
  assert.equal((await request(app).post('/api/v1/appointments').send(withoutConsent)).status, 400);

  await Clinic.updateOne({ key: 'default' }, { $set: { 'bookingSettings.requireEmail': true } });
  const withoutEmail = { ...publicBooking(core, '09:00', '922'), patientEmail: '' };
  const response = await request(app).post('/api/v1/appointments').send(withoutEmail);
  assert.equal(response.status, 400);
  assert.match(response.body.message, /Email is required/);
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
  for (const status of ['confirmed', 'checked_in', 'in_progress', 'completed']) {
    const response = await request(app)
      .patch(`/api/v1/appointments/${appointment._id}/status`)
      .set(auth(staff.adminToken))
      .send({ status });
    assert.equal(response.status, 200);
  }
  const invalid = await request(app)
    .patch(`/api/v1/appointments/${appointment._id}/status`)
    .set(auth(staff.adminToken))
    .send({ status: 'confirmed' });
  assert.equal(invalid.status, 409);

  const reschedule = await request(app)
    .patch(`/api/v1/appointments/${appointment._id}/reschedule`)
    .set(auth(staff.adminToken))
    .send({ date: core.date, startTime: '14:00' });
  assert.equal(reschedule.status, 409);
});

test('concurrent transitions from one state have exactly one winner', async () => {
  const appointment = await createDirect('13:00', '961');
  const responses = await Promise.all([
    request(app)
      .patch(`/api/v1/appointments/${appointment._id}/status`)
      .set(auth(staff.adminToken))
      .send({ status: 'confirmed' }),
    request(app)
      .patch(`/api/v1/appointments/${appointment._id}/status`)
      .set(auth(staff.adminToken))
      .send({ status: 'no_show' }),
  ]);
  assert.deepEqual(responses.map(({ status }) => status).sort(), [200, 409]);
});

test('cancelled and no-show appointments reject invalid transitions and rescheduling', async () => {
  const cancelled = await createDirect('14:00', '971');
  await appointmentService.cancelAppointment(cancelled._id, staff.admin._id, 'Cancelled');
  assert.equal(
    (await request(app)
      .patch(`/api/v1/appointments/${cancelled._id}/status`)
      .set(auth(staff.adminToken))
      .send({ status: 'checked_in' })).status,
    409,
  );

  const noShow = await createDirect('15:00', '972');
  await appointmentService.updateStatus(noShow._id, 'no_show');
  assert.equal(
    (await request(app)
      .patch(`/api/v1/appointments/${noShow._id}/reschedule`)
      .set(auth(staff.adminToken))
      .send({ date: core.date, startTime: '16:00' })).status,
    409,
  );
});

test('maximum bookings per phone per local date is enforced and cancelled bookings do not count', async () => {
  await Clinic.updateOne({ key: 'default' }, { $set: { 'bookingSettings.maxAppointmentsPerPhonePerDay': 1 } });
  const samePhone = publicBooking(core, '09:00', '981');
  assert.equal((await request(app).post('/api/v1/appointments').send(samePhone)).status, 201);
  const second = await request(app).post('/api/v1/appointments').send({ ...samePhone, startTime: '11:00' });
  assert.equal(second.status, 429);

  const existing = await Appointment.findOne({ patientPhone: samePhone.patientPhone });
  await appointmentService.cancelAppointment(existing._id, staff.admin._id, 'Cancelled');
  assert.equal((await request(app).post('/api/v1/appointments').send({ ...samePhone, startTime: '11:00' })).status, 201);
});

test('appointment administration is available to receptionists but denied to dentist-role users', async () => {
  await createDirect('16:00', '991');
  assert.equal((await request(app).get('/api/v1/appointments').set(auth(staff.receptionistToken))).status, 200);
  assert.equal((await request(app).get('/api/v1/appointments').set(auth(staff.dentistToken))).status, 403);
});
