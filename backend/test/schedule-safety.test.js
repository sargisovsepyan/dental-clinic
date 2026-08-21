import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
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
const {
  publicBooking,
  seedCore,
  seedStaff,
} = await import('../test-support/fixtures.js');
const { default: app } = await import('../src/app.js');
const { default: Appointment } = await import(
  '../src/modules/appointments/appointment.model.js'
);
const appointmentService = await import(
  '../src/modules/appointments/appointment.service.js'
);
const { default: Clinic } = await import(
  '../src/modules/clinic/clinic.model.js'
);
const { default: ClinicClosure } = await import(
  '../src/modules/clinic/clinicClosure.model.js'
);
const clinicService = await import('../src/modules/clinic/clinic.service.js');
const { default: Dentist } = await import(
  '../src/modules/dentists/dentist.model.js'
);
const { default: DentistScheduleException } = await import(
  '../src/modules/dentists/dentistScheduleException.model.js'
);
const { default: Service } = await import(
  '../src/modules/services/service.model.js'
);
const { default: ServiceCategory } = await import(
  '../src/modules/serviceCategories/serviceCategory.model.js'
);
const scheduleRevisionMigration = await import(
  '../src/migrations/20260814_009_schedule_revisions.js'
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

const admin = () => ({
  Authorization: `Bearer ${staff.adminToken}`,
});

const weekday = () => DateTime.fromISO(core.date, {
  zone: 'Asia/Yerevan',
}).weekday;

const clinicDay = (isOpen, shifts = []) => ({
  dayOfWeek: weekday(),
  isOpen,
  shifts,
});

const dentistDay = (isWorking, shifts = []) => ({
  dayOfWeek: weekday(),
  isWorking,
  shifts,
});

const book = async (startTime = '09:00', suffix = '701') => (
  appointmentService.createAppointment(
    publicBooking(core, startTime, suffix)
  )
);

const persistedAppointment = (id) => Appointment.findById(id)
  .select('+lockKeys')
  .lean();

const assertPrivacyMinimizedConflict = (response, appointment) => {
  assert.equal(response.status, 409);
  assert.equal(
    response.body.code,
    'SCHEDULE_CONFLICT_ACKNOWLEDGEMENT_REQUIRED'
  );
  assert.equal(response.body.details.conflictCount, 1);
  assert.equal(response.body.details.conflictsTruncated, false);
  assert.match(response.body.details.acknowledgementToken, /^[a-f0-9]{64}$/);

  const summary = response.body.details.conflicts[0];
  assert.deepEqual(
    Object.keys(summary).sort(),
    [
      'appointmentId',
      'date',
      'dentistId',
      'endTime',
      'startTime',
      'status',
    ]
  );
  assert.equal(summary.appointmentId, String(appointment._id));

  const serialized = JSON.stringify(response.body.details);
  for (const sensitive of [
    appointment.patientName,
    appointment.patientPhone,
    appointment.patientEmail,
    appointment.patientComment,
  ]) {
    if (sensitive) {
      assert.equal(serialized.includes(sensitive), false);
    }
  }
};

const assertAppointmentPreserved = async (before) => {
  const afterState = await persistedAppointment(before._id);
  assert.equal(afterState.status, before.status);
  assert.equal(afterState.date, before.date);
  assert.equal(afterState.startTime, before.startTime);
  assert.equal(afterState.endTime, before.endTime);
  assert.deepEqual(afterState.lockKeys, before.lockKeys);
};


test('clinic weekly conflicts require privacy-minimized exact acknowledgement and preserve the appointment lock', async () => {
  const created = await book('09:00');
  const beforeState = await persistedAppointment(created._id);
  const proposal = [clinicDay(false)];

  const blocked = await request(app)
    .patch('/api/v1/clinic')
    .set(admin())
    .send({
      expectedScheduleRevision: 0,
      weeklySchedule: proposal,
    });
  assertPrivacyMinimizedConflict(blocked, beforeState);
  assert.equal((await Clinic.findOne({ key: 'default' })).scheduleRevision, 0);

  const accepted = await request(app)
    .patch('/api/v1/clinic')
    .set(admin())
    .send({
      expectedScheduleRevision: 0,
      scheduleConflictAcknowledgement:
        blocked.body.details.acknowledgementToken,
      weeklySchedule: proposal,
    });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.data.clinic.scheduleRevision, 1);
  await assertAppointmentPreserved(beforeState);
});


test('dentist weekly conflicts require exact acknowledgement and preserve the appointment lock', async () => {
  const created = await book('09:00');
  const beforeState = await persistedAppointment(created._id);
  const proposal = [dentistDay(false)];

  const blocked = await request(app)
    .patch(`/api/v1/dentists/${core.dentist._id}`)
    .set(admin())
    .send({
      expectedScheduleRevision: 0,
      weeklySchedule: proposal,
    });
  assertPrivacyMinimizedConflict(blocked, beforeState);

  const accepted = await request(app)
    .patch(`/api/v1/dentists/${core.dentist._id}`)
    .set(admin())
    .send({
      expectedScheduleRevision: 0,
      scheduleConflictAcknowledgement:
        blocked.body.details.acknowledgementToken,
      weeklySchedule: proposal,
    });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.data.dentist.scheduleRevision, 1);
  await assertAppointmentPreserved(beforeState);
});


test('clinic altered-hours conflict includes the stored trailing buffer', async () => {
  await clearReplTestDatabase();
  core = await seedCore({ bufferMinutes: 30 });
  staff = await seedStaff();
  const created = await book('11:30', '702');
  const beforeState = await persistedAppointment(created._id);
  const path = `/api/v1/clinic/closures/${core.date}`;
  const proposal = {
    expectedScheduleRevision: 0,
    isOpen: true,
    shifts: [{ start: '09:00', end: '12:30' }],
    note: 'Short day',
  };

  const blocked = await request(app)
    .put(path)
    .set(admin())
    .send(proposal);
  assertPrivacyMinimizedConflict(blocked, beforeState);
  assert.equal(await ClinicClosure.countDocuments({ date: core.date }), 0);

  await request(app)
    .put(path)
    .set(admin())
    .send({
      ...proposal,
      scheduleConflictAcknowledgement:
        blocked.body.details.acknowledgementToken,
    })
    .expect(200);
  assert.equal((await Clinic.findOne({ key: 'default' })).scheduleRevision, 1);
  await assertAppointmentPreserved(beforeState);
});


test('dentist day-off exception requires acknowledgement and preserves the appointment', async () => {
  const created = await book('09:00', '703');
  const beforeState = await persistedAppointment(created._id);
  const path =
    `/api/v1/dentists/${core.dentist._id}/schedule-exceptions/${core.date}`;

  const blocked = await request(app)
    .put(path)
    .set(admin())
    .send({
      expectedScheduleRevision: 0,
      isWorking: false,
      shifts: [],
      note: 'Leave',
    });
  assertPrivacyMinimizedConflict(blocked, beforeState);

  await request(app)
    .put(path)
    .set(admin())
    .send({
      expectedScheduleRevision: 0,
      scheduleConflictAcknowledgement:
        blocked.body.details.acknowledgementToken,
      isWorking: false,
      shifts: [],
      note: 'Leave',
    })
    .expect(200);
  assert.equal((await Dentist.findById(core.dentist._id)).scheduleRevision, 1);
  await assertAppointmentPreserved(beforeState);
});


test('clinic exception deletion is conflict-aware when the weekly schedule is closed', async () => {
  await request(app)
    .patch('/api/v1/clinic')
    .set(admin())
    .send({
      expectedScheduleRevision: 0,
      weeklySchedule: [clinicDay(false)],
    })
    .expect(200);
  const path = `/api/v1/clinic/closures/${core.date}`;
  await request(app)
    .put(path)
    .set(admin())
    .send({
      expectedScheduleRevision: 1,
      isOpen: true,
      shifts: [{ start: '09:00', end: '18:00' }],
    })
    .expect(200);
  const created = await book('09:00', '704');
  const beforeState = await persistedAppointment(created._id);

  const blocked = await request(app)
    .delete(path)
    .set(admin())
    .query({ expectedScheduleRevision: 2 });
  assertPrivacyMinimizedConflict(blocked, beforeState);

  await request(app)
    .delete(path)
    .set(admin())
    .query({
      expectedScheduleRevision: 2,
      scheduleConflictAcknowledgement:
        blocked.body.details.acknowledgementToken,
    })
    .expect(200);
  assert.equal(await ClinicClosure.countDocuments({ date: core.date }), 0);
  assert.equal((await Clinic.findOne({ key: 'default' })).scheduleRevision, 3);
  await assertAppointmentPreserved(beforeState);
});


test('dentist exception deletion is conflict-aware when the weekly schedule is closed', async () => {
  const dentistPath = `/api/v1/dentists/${core.dentist._id}`;
  await request(app)
    .patch(dentistPath)
    .set(admin())
    .send({
      expectedScheduleRevision: 0,
      weeklySchedule: [dentistDay(false)],
    })
    .expect(200);
  const exceptionPath = `${dentistPath}/schedule-exceptions/${core.date}`;
  await request(app)
    .put(exceptionPath)
    .set(admin())
    .send({
      expectedScheduleRevision: 1,
      isWorking: true,
      shifts: [{ start: '09:00', end: '18:00' }],
    })
    .expect(200);
  const created = await book('09:00', '705');
  const beforeState = await persistedAppointment(created._id);

  const blocked = await request(app)
    .delete(exceptionPath)
    .set(admin())
    .query({ expectedScheduleRevision: 2 });
  assertPrivacyMinimizedConflict(blocked, beforeState);

  await request(app)
    .delete(exceptionPath)
    .set(admin())
    .query({
      expectedScheduleRevision: 2,
      scheduleConflictAcknowledgement:
        blocked.body.details.acknowledgementToken,
    })
    .expect(200);
  assert.equal(
    await DentistScheduleException.countDocuments({
      dentist: core.dentist._id,
      date: core.date,
    }),
    0
  );
  assert.equal((await Dentist.findById(core.dentist._id)).scheduleRevision, 3);
  await assertAppointmentPreserved(beforeState);
});


test('no-conflict schedule changes succeed once and stale revisions fail closed', async () => {
  const clinicProposal = [clinicDay(false)];
  await request(app)
    .patch('/api/v1/clinic')
    .set(admin())
    .send({
      expectedScheduleRevision: 0,
      weeklySchedule: clinicProposal,
    })
    .expect(200);
  const staleClinic = await request(app)
    .patch('/api/v1/clinic')
    .set(admin())
    .send({
      expectedScheduleRevision: 0,
      weeklySchedule: [clinicDay(true, [{ start: '10:00', end: '17:00' }])],
    });
  assert.equal(staleClinic.status, 409);
  assert.equal(staleClinic.body.code, 'SCHEDULE_REVISION_CONFLICT');
  assert.deepEqual(
    (await Clinic.findOne({ key: 'default' })).weeklySchedule.toObject(),
    clinicProposal
  );

  const dentistProposal = [dentistDay(false)];
  await request(app)
    .patch(`/api/v1/dentists/${core.dentist._id}`)
    .set(admin())
    .send({
      expectedScheduleRevision: 0,
      weeklySchedule: dentistProposal,
    })
    .expect(200);
  const staleDentist = await request(app)
    .patch(`/api/v1/dentists/${core.dentist._id}`)
    .set(admin())
    .send({
      expectedScheduleRevision: 0,
      weeklySchedule: [
        dentistDay(true, [{ start: '10:00', end: '17:00' }]),
      ],
    });
  assert.equal(staleDentist.status, 409);
  assert.equal(staleDentist.body.code, 'SCHEDULE_REVISION_CONFLICT');
  assert.deepEqual(
    (await Dentist.findById(core.dentist._id)).weeklySchedule.toObject(),
    dentistProposal
  );
});


test('a clinic closure that wins after availability prevents the stale booking admission', async () => {
  const originalUpdateOne = Clinic.updateOne;
  let reachedAdmission;
  let releaseAdmission;
  const admissionReached = new Promise((resolve) => {
    reachedAdmission = resolve;
  });
  const admissionReleased = new Promise((resolve) => {
    releaseAdmission = resolve;
  });
  let held = false;

  Clinic.updateOne = async function (filter, update, options) {
    const isBookingAdmission =
      !held &&
      Array.isArray(filter?.$or) &&
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
    const booking = book('09:00', '706');
    await admissionReached;
    await clinicService.upsertClosure(core.date, {
      expectedScheduleRevision: 0,
      isOpen: false,
      shifts: [],
      note: 'Emergency closure',
    });
    releaseAdmission();

    await assert.rejects(
      booking,
      (error) => error.statusCode === 409 && /available/.test(error.message)
    );
    assert.equal(await Appointment.countDocuments({}), 0);
    assert.equal((await Clinic.findOne({ key: 'default' })).scheduleRevision, 1);
    assert.equal(
      (await ClinicClosure.findOne({ date: core.date })).isOpen,
      false
    );
  }
  finally {
    releaseAdmission?.();
    Clinic.updateOne = originalUpdateOne;
  }
});


test('schedule revision migration is dry-run safe, forward-only, and idempotent', async () => {
  await Clinic.collection.updateOne(
    { _id: core.clinic._id },
    { $unset: { scheduleRevision: '', bookingGuardVersion: '' } }
  );
  await Dentist.collection.updateOne(
    { _id: core.dentist._id },
    { $unset: { scheduleRevision: '', bookingGuardVersion: '' } }
  );
  await Service.collection.updateOne(
    { _id: core.service._id },
    { $unset: { bookingGuardVersion: '' } }
  );
  await ServiceCategory.collection.updateOne(
    { _id: core.category._id },
    { $unset: { serviceMutationVersion: '' } }
  );
  await Dentist.collection.updateOne(
    { _id: core.secondDentist._id },
    { $set: { scheduleRevision: 7, bookingGuardVersion: 11 } }
  );

  const dryRun = await scheduleRevisionMigration.run({ dryRun: true });
  assert.equal(dryRun.clinicsMissingScheduleRevision, 1);
  assert.equal(dryRun.clinicsMissingBookingGuardVersion, 1);
  assert.equal(dryRun.dentistsMissingScheduleRevision, 1);
  assert.equal(dryRun.dentistsMissingBookingGuardVersion, 1);
  assert.equal(dryRun.servicesMissingBookingGuardVersion, 1);
  assert.equal(dryRun.categoriesMissingServiceMutationVersion, 1);
  assert.equal(dryRun.clinicScheduleRevisionsInitialized, 0);
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      await Clinic.collection.findOne({ _id: core.clinic._id }),
      'scheduleRevision'
    ),
    false
  );

  const applied = await scheduleRevisionMigration.run({ dryRun: false });
  assert.equal(applied.clinicScheduleRevisionsInitialized, 1);
  assert.equal(applied.clinicBookingGuardsInitialized, 1);
  assert.equal(applied.dentistScheduleRevisionsInitialized, 1);
  assert.equal(applied.dentistBookingGuardsInitialized, 1);
  assert.equal(applied.serviceBookingGuardsInitialized, 1);
  assert.equal(applied.categoryServiceMutationVersionsInitialized, 1);

  const clinic = await Clinic.collection.findOne({ _id: core.clinic._id });
  const migratedDentist = await Dentist.collection.findOne({
    _id: core.dentist._id,
  });
  const existingDentist = await Dentist.collection.findOne({
    _id: core.secondDentist._id,
  });
  const migratedService = await Service.collection.findOne({
    _id: core.service._id,
  });
  const migratedCategory = await ServiceCategory.collection.findOne({
    _id: core.category._id,
  });
  assert.equal(clinic.scheduleRevision, 0);
  assert.equal(clinic.bookingGuardVersion, 0);
  assert.equal(migratedDentist.scheduleRevision, 0);
  assert.equal(migratedDentist.bookingGuardVersion, 0);
  assert.equal(existingDentist.scheduleRevision, 7);
  assert.equal(existingDentist.bookingGuardVersion, 11);
  assert.equal(migratedService.bookingGuardVersion, 0);
  assert.equal(migratedCategory.serviceMutationVersion, 0);

  const rerun = await scheduleRevisionMigration.run({ dryRun: false });
  assert.equal(rerun.clinicScheduleRevisionsInitialized, 0);
  assert.equal(rerun.clinicBookingGuardsInitialized, 0);
  assert.equal(rerun.dentistScheduleRevisionsInitialized, 0);
  assert.equal(rerun.dentistBookingGuardsInitialized, 0);
  assert.equal(rerun.serviceBookingGuardsInitialized, 0);
  assert.equal(rerun.categoryServiceMutationVersionsInitialized, 0);
});
