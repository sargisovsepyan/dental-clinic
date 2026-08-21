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
  connectReplTestDatabase,
  clearReplTestDatabase,
  disconnectReplTestDatabase,
} = await import('../test-support/replDatabase.js');
const { publicBooking, seedCore, seedStaff } = await import(
  '../test-support/fixtures.js'
);
const { default: app } = await import('../src/app.js');
const { default: Appointment } = await import(
  '../src/modules/appointments/appointment.model.js'
);
const { default: Clinic } = await import('../src/modules/clinic/clinic.model.js');
const { default: Service } = await import(
  '../src/modules/services/service.model.js'
);
const availabilityService = await import(
  '../src/modules/availability/availability.service.js'
);
const appointmentService = await import(
  '../src/modules/appointments/appointment.service.js'
);
const clinicService = await import('../src/modules/clinic/clinic.service.js');
const serviceService = await import('../src/modules/services/service.service.js');
const cancellationNoticeMigration = await import(
  '../src/migrations/20260814_010_remove_cancellation_notice.js'
);

let core;
let staff;

before(connectReplTestDatabase);
beforeEach(async () => {
  await clearReplTestDatabase();
  core = await seedCore();
  staff = await seedStaff();
});
after(disconnectReplTestDatabase);

const publicRequest = (body, key = randomUUID()) => request(app)
  .post('/api/v1/appointments')
  .set('Idempotency-Key', key)
  .send(body);

test('global booking disable blocks availability and appointment admission', async () => {
  await Clinic.updateOne(
    { key: 'default' },
    { $set: { 'bookingSettings.isBookingEnabled': false } }
  );
  const query = {
    dentistId: core.dentist._id,
    serviceId: core.service._id,
    date: core.date,
  };
  await assert.rejects(
    availabilityService.getAvailability(query),
    (error) => error.statusCode === 503
  );
  assert.equal(
    (await publicRequest(publicBooking(core, '09:00', '751'))).status,
    503
  );
  assert.equal(await Appointment.countDocuments(), 0);
});

test('auto-confirm creates the public result and stored appointment as confirmed', async () => {
  await Clinic.updateOne(
    { key: 'default' },
    { $set: { 'bookingSettings.autoConfirmAppointments': true } }
  );
  const response = await publicRequest(publicBooking(core, '09:00', '752'));
  assert.equal(response.status, 201);
  assert.equal(response.body.data.appointment.status, 'confirmed');
  assert.equal(
    (await Appointment.findById(response.body.data.appointment.id)).status,
    'confirmed'
  );
});

test('a booking-setting update that wins after availability prevents stale admission', async () => {
  const originalUpdateOne = Clinic.updateOne;
  let reachedAdmission;
  let releaseAdmission;
  const admissionReached = new Promise((resolve) => { reachedAdmission = resolve; });
  const admissionReleased = new Promise((resolve) => { releaseAdmission = resolve; });
  let held = false;

  Clinic.updateOne = async function (filter, update, options) {
    const isBookingAdmission =
      !held && Array.isArray(filter?.$or) &&
      !Object.prototype.hasOwnProperty.call(filter, 'scheduleRevision') &&
      update?.$inc?.bookingGuardVersion === 1;
    if (isBookingAdmission) {
      held = true;
      reachedAdmission();
      await admissionReleased;
    }
    return originalUpdateOne.call(this, filter, update, options);
  };

  try {
    const booking = appointmentService.createAppointment(
      publicBooking(core, '09:00', '753')
    );
    await admissionReached;
    await clinicService.updateClinic({
      bookingSettings: { isBookingEnabled: false },
    });
    releaseAdmission();

    await assert.rejects(
      booking,
      (error) => error.statusCode === 503
    );
    assert.equal(await Appointment.countDocuments(), 0);
  }
  finally {
    releaseAdmission?.();
    Clinic.updateOne = originalUpdateOne;
  }
});

test('a service disable that wins after availability prevents stale admission', async () => {
  const originalUpdateOne = Service.updateOne;
  let reachedAdmission;
  let releaseAdmission;
  const admissionReached = new Promise((resolve) => { reachedAdmission = resolve; });
  const admissionReleased = new Promise((resolve) => { releaseAdmission = resolve; });
  let held = false;

  Service.updateOne = async function (filter, update, options) {
    const isBookingAdmission =
      !held && filter?.isActive === true && filter?.bookingEnabled === true &&
      update?.$inc?.bookingGuardVersion === 1;
    if (isBookingAdmission) {
      held = true;
      reachedAdmission();
      await admissionReleased;
    }
    return originalUpdateOne.call(this, filter, update, options);
  };

  try {
    const booking = appointmentService.createAppointment(
      publicBooking(core, '09:00', '754')
    );
    await admissionReached;
    await serviceService.deleteService(core.service._id);
    releaseAdmission();

    await assert.rejects(booking, (error) => error.statusCode === 404);
    assert.equal(await Appointment.countDocuments(), 0);
    const disabled = await Service.findById(core.service._id).lean();
    assert.equal(disabled.isActive, false);
    assert.equal(disabled.bookingEnabled, false);
  }
  finally {
    releaseAdmission?.();
    Service.updateOne = originalUpdateOne;
  }
});

test('failed reschedule after a service disable preserves the original lock', async () => {
  const created = await publicRequest(publicBooking(core, '09:00', '755'));
  assert.equal(created.status, 201);
  const id = created.body.data.appointment.id;
  const original = await Appointment.findById(id).select('+lockKeys').lean();
  const originalUpdateOne = Service.updateOne;
  let reachedAdmission;
  let releaseAdmission;
  const admissionReached = new Promise((resolve) => { reachedAdmission = resolve; });
  const admissionReleased = new Promise((resolve) => { releaseAdmission = resolve; });
  let held = false;

  Service.updateOne = async function (filter, update, options) {
    const isBookingAdmission =
      !held && filter?.isActive === true && filter?.bookingEnabled === true &&
      update?.$inc?.bookingGuardVersion === 1;
    if (isBookingAdmission) {
      held = true;
      reachedAdmission();
      await admissionReleased;
    }
    return originalUpdateOne.call(this, filter, update, options);
  };

  try {
    const reschedule = appointmentService.rescheduleAppointment(
      id,
      { date: core.date, startTime: '11:00' },
      staff.admin._id
    );
    await admissionReached;
    await serviceService.deleteService(core.service._id);
    releaseAdmission();

    await assert.rejects(reschedule, (error) => error.statusCode === 404);
    const preserved = await Appointment.findById(id).select('+lockKeys').lean();
    assert.equal(preserved.date, original.date);
    assert.equal(preserved.startTime, original.startTime);
    assert.deepEqual(preserved.lockKeys, original.lockKeys);
    assert.equal(preserved.mutationVersion, original.mutationVersion);
  }
  finally {
    releaseAdmission?.();
    Service.updateOne = originalUpdateOne;
  }
});

test('legacy cancellation notice is rejected by API and removed explicitly', async () => {
  const rejected = await request(app)
    .patch('/api/v1/clinic')
    .set('Authorization', `Bearer ${staff.adminToken}`)
    .send({ bookingSettings: { cancellationNoticeHours: 24 } });
  assert.equal(rejected.status, 400);

  await Clinic.collection.updateOne(
    { key: 'default' },
    { $set: { 'bookingSettings.cancellationNoticeHours': 24 } }
  );
  const dryRun = await cancellationNoticeMigration.run({ dryRun: true });
  assert.equal(dryRun.clinicsWithLegacySetting, 1);
  assert.equal(dryRun.legacySettingsRemoved, 0);
  assert.equal(
    (await Clinic.collection.findOne({ key: 'default' }))
      .bookingSettings.cancellationNoticeHours,
    24
  );

  const applied = await cancellationNoticeMigration.run({ dryRun: false });
  assert.equal(applied.legacySettingsRemoved, 1);
  assert.equal(
    (await Clinic.collection.findOne({ key: 'default' }))
      .bookingSettings.cancellationNoticeHours,
    undefined
  );
  assert.equal(
    (await cancellationNoticeMigration.run({ dryRun: false }))
      .legacySettingsRemoved,
    0
  );
});
