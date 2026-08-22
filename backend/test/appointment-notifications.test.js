import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/dental_clinic_test';
process.env.JWT_SECRET = 'test-only-secret-that-is-at-least-thirty-two-characters';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.CLINIC_TIMEZONE = 'Asia/Yerevan';
process.env.NOTIFICATIONS_ENABLED = 'true';
process.env.CLINIC_NOTIFICATION_EMAIL = 'reception@example.test';

const {
  connectReplTestDatabase,
  clearReplTestDatabase,
  disconnectReplTestDatabase,
} = await import('../test-support/replDatabase.js');
const { seedCore, seedStaff, publicBooking } = await import('../test-support/fixtures.js');
const { default: Appointment } = await import('../src/modules/appointments/appointment.model.js');
const { default: BookingIdempotency } = await import(
  '../src/modules/appointments/bookingIdempotency.model.js'
);
const { default: Clinic } = await import('../src/modules/clinic/clinic.model.js');
const { default: NotificationJob } = await import(
  '../src/modules/notifications/notificationJob.model.js'
);
const appointmentService = await import(
  '../src/modules/appointments/appointment.service.js'
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

const booking = (startTime = '09:00', suffix = '701', locale = 'hy') => ({
  ...publicBooking(core, startTime, suffix),
  locale,
});

const create = (startTime, suffix, locale = 'hy', context = {}) => (
  appointmentService.createAppointment(
    booking(startTime, suffix, locale),
    context
  )
);


test('pending online booking atomically schedules received, clinic, and exact 24h reminder jobs', async () => {
  const appointment = await create('09:00', '711', 'ru');
  const jobs = await NotificationJob.find({ appointment: appointment._id })
    .sort({ eventType: 1 })
    .lean();

  assert.deepEqual(
    jobs.map(({ eventType }) => eventType).sort(),
    [
      'appointment_received',
      'appointment_reminder',
      'clinic_new_booking',
    ]
  );
  const received = jobs.find(({ eventType }) => eventType === 'appointment_received');
  const reminder = jobs.find(({ eventType }) => eventType === 'appointment_reminder');
  assert.equal(received.locale, 'ru');
  assert.equal(received.recipientKind, 'appointment_patient');
  assert.equal(reminder.scheduleRevision, 0);
  assert.equal(
    reminder.dueAt.getTime(),
    new Date(appointment.startAt).getTime() - 24 * 60 * 60 * 1000
  );
  assert.equal(reminder.eventSnapshot.after.serviceNames.ru, undefined);
  assert.equal(reminder.eventSnapshot.after.serviceNames.hy, 'Պրոֆեսիոնալ մաքրում');
  assert.equal(jobs.some(({ eventType }) => eventType === 'appointment_confirmed'), false);
});


test('auto-confirmed online booking schedules confirmed but never received communication', async () => {
  await Clinic.updateOne(
    { key: 'default' },
    { $set: { 'bookingSettings.autoConfirmAppointments': true } }
  );
  const appointment = await create('10:00', '712', 'en');
  const types = await NotificationJob.distinct('eventType', {
    appointment: appointment._id,
  });
  assert.ok(types.includes('appointment_confirmed'));
  assert.ok(types.includes('appointment_reminder'));
  assert.ok(types.includes('clinic_new_booking'));
  assert.equal(types.includes('appointment_received'), false);
});


test('pending to confirmed is transactional, supersedes received, and schedules confirmation once', async () => {
  const appointment = await create('11:00', '713');
  const results = await Promise.allSettled([
    appointmentService.updateStatus(appointment._id, 'confirmed'),
    appointmentService.updateStatus(appointment._id, 'confirmed'),
  ]);
  assert.equal(results.filter(({ status }) => status === 'fulfilled').length, 1);
  assert.equal(results.filter(({ status }) => status === 'rejected').length, 1);

  const jobs = await NotificationJob.find({ appointment: appointment._id }).lean();
  assert.equal(
    jobs.filter(({ eventType }) => eventType === 'appointment_confirmed').length,
    1
  );
  assert.equal(
    jobs.find(({ eventType }) => eventType === 'appointment_received').status,
    'cancelled'
  );
  assert.equal(
    jobs.filter(({ eventType }) => eventType === 'appointment_reminder').length,
    1
  );
});


test('booking replay and locale-aware v2 fingerprint never create duplicate logical jobs', async () => {
  const key = randomUUID();
  const payload = booking('12:00', '714', 'ru');
  const first = await appointmentService.createAppointment(payload, {
    idempotencyKey: key,
  });
  const replay = await appointmentService.createAppointment(payload, {
    idempotencyKey: key,
  });
  assert.equal(String(replay._id), String(first._id));
  assert.equal(await NotificationJob.countDocuments({ appointment: first._id }), 3);

  await assert.rejects(
    appointmentService.createAppointment(
      { ...payload, locale: 'en' },
      { idempotencyKey: key }
    ),
    /different booking request/
  );
  assert.equal(await NotificationJob.countDocuments({ appointment: first._id }), 3);
});


test('logical outbox scheduling is idempotent for the same event identity', async () => {
  const appointment = await create('12:30', '731', 'hy');
  const existing = await NotificationJob.findOne({
    appointment: appointment._id,
    eventType: 'appointment_received',
  }).select('+dedupeKey').lean();
  const { scheduleNotification } = await import(
    '../src/modules/notifications/notificationOutbox.service.js'
  );
  const inputs = {
    appointment,
    eventType: existing.eventType,
    eventRevision: existing.eventRevision,
    scheduleRevision: existing.scheduleRevision,
    recipientKind: existing.recipientKind,
    dueAt: existing.dueAt,
    eventSnapshot: existing.eventSnapshot,
    identity: 'created',
  };
  await Promise.all([
    scheduleNotification(inputs),
    scheduleNotification(inputs),
  ]);
  assert.equal(
    await NotificationJob.countDocuments({
      appointment: appointment._id,
      eventType: 'appointment_received',
    }),
    1
  );
});


test('slot-conflict transaction loser leaves no ghost notification jobs', async () => {
  const outcomes = await Promise.allSettled([
    create('13:30', '722'),
    create('13:30', '723'),
  ]);
  assert.equal(outcomes.filter(({ status }) => status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter(({ status }) => status === 'rejected').length, 1);
  const winner = outcomes.find(({ status }) => status === 'fulfilled').value;
  assert.equal(await Appointment.countDocuments(), 1);
  assert.equal(await NotificationJob.countDocuments(), 3);
  assert.equal(
    await NotificationJob.countDocuments({ appointment: winner._id }),
    3
  );
});


test('active legacy v1 idempotency records replay across locale-aware cutover', async () => {
  const key = randomUUID();
  const payload = booking('13:00', '715', 'hy');
  const first = await appointmentService.createAppointment(payload, {
    idempotencyKey: key,
  });
  const v1 = appointmentService.hashBookingRequest(
    payload,
    payload.patientPhone,
    key,
    'v1'
  );
  await BookingIdempotency.collection.updateOne(
    { appointment: first._id },
    {
      $set: { requestHash: v1 },
      $unset: { requestHashVersion: '' },
    }
  );

  const replay = await appointmentService.createAppointment(
    { ...payload, locale: 'en' },
    { idempotencyKey: key }
  );
  assert.equal(String(replay._id), String(first._id));
  assert.equal(await NotificationJob.countDocuments({ appointment: first._id }), 3);
});


test('successful reschedule supersedes old jobs and atomically creates immutable change and reminder snapshots', async () => {
  const appointment = await create('09:00', '716', 'en');
  const updated = await appointmentService.rescheduleAppointment(
    appointment._id,
    { date: core.date, startTime: '14:00', reason: 'private reason' },
    staff.admin._id
  );
  assert.equal(updated.scheduleRevision, 1);

  const jobs = await NotificationJob.find({ appointment: appointment._id }).lean();
  const rescheduled = jobs.find(({ eventType }) => eventType === 'appointment_rescheduled');
  const reminders = jobs.filter(({ eventType }) => eventType === 'appointment_reminder');
  assert.equal(rescheduled.status, 'pending');
  assert.equal(rescheduled.scheduleRevision, 1);
  assert.notEqual(
    rescheduled.eventSnapshot.before.startAt.getTime(),
    rescheduled.eventSnapshot.after.startAt.getTime()
  );
  assert.equal(JSON.stringify(rescheduled).includes('private reason'), false);
  assert.equal(reminders.length, 2);
  assert.equal(reminders.find(({ scheduleRevision }) => scheduleRevision === 0).status, 'cancelled');
  assert.equal(reminders.find(({ scheduleRevision }) => scheduleRevision === 1).status, 'pending');
});


test('failed reschedule preserves the original reminder and creates no lifecycle job', async () => {
  const appointment = await create('10:00', '717');
  await create('14:00', '718');
  await assert.rejects(
    appointmentService.rescheduleAppointment(
      appointment._id,
      { date: core.date, startTime: '14:00' },
      staff.admin._id
    ),
    /not available|just booked/
  );
  const jobs = await NotificationJob.find({ appointment: appointment._id }).lean();
  assert.equal(
    jobs.find(({ eventType }) => eventType === 'appointment_reminder').status,
    'pending'
  );
  assert.equal(
    jobs.some(({ eventType }) => eventType === 'appointment_rescheduled'),
    false
  );
});


test('exact-current-slot reschedule is a true no-op with no revision or notification churn', async () => {
  const appointment = await create('15:00', '719');
  const beforeJobs = await NotificationJob.countDocuments({ appointment: appointment._id });
  const updated = await appointmentService.rescheduleAppointment(
    appointment._id,
    { date: core.date, startTime: '15:00' },
    staff.admin._id
  );
  assert.equal(updated.scheduleRevision, 0);
  assert.equal(updated.mutationVersion, 0);
  assert.equal(updated.rescheduleHistory.length, 0);
  assert.equal(
    await NotificationJob.countDocuments({ appointment: appointment._id }),
    beforeJobs
  );
});


test('exact-current-slot no-op is fenced against concurrent cancellation', async () => {
  const appointment = await create('15:30', '729');
  const [noOp, cancellation] = await Promise.allSettled([
    appointmentService.rescheduleAppointment(
      appointment._id,
      { date: core.date, startTime: '15:30' },
      staff.admin._id
    ),
    appointmentService.cancelAppointment(
      appointment._id,
      staff.admin._id,
      'concurrent cancellation'
    ),
  ]);

  assert.equal(cancellation.status, 'fulfilled');
  if (noOp.status === 'fulfilled') {
    assert.equal(noOp.value.status, 'pending');
    assert.equal(noOp.value.mutationVersion, 0);
  }
  else {
    assert.match(noOp.reason.message, /changed|reschedule a cancelled/i);
  }
  const stored = await Appointment.findById(appointment._id).lean();
  assert.equal(stored.status, 'cancelled');
  assert.equal(stored.mutationVersion, 1);
});


test('checked-in appointments cannot be rescheduled or create undeliverable jobs', async () => {
  const appointment = await create('15:00', '730');
  await appointmentService.updateStatus(appointment._id, 'confirmed');
  await appointmentService.updateStatus(appointment._id, 'checked_in');
  const beforeJobs = await NotificationJob.countDocuments({
    appointment: appointment._id,
  });

  await assert.rejects(
    appointmentService.rescheduleAppointment(
      appointment._id,
      { date: core.date, startTime: '16:00' },
      staff.admin._id
    ),
    /Cannot reschedule a checked_in appointment/
  );
  assert.equal(
    await NotificationJob.countDocuments({ appointment: appointment._id }),
    beforeJobs
  );
  assert.equal(
    await NotificationJob.countDocuments({
      appointment: appointment._id,
      eventType: 'appointment_rescheduled',
    }),
    0
  );
});


test('committed cancellation fences all old patient jobs and schedules one cancellation', async () => {
  const appointment = await create('16:00', '720');
  const cancelled = await appointmentService.cancelAppointment(
    appointment._id,
    staff.admin._id,
    'patient request'
  );
  const jobs = await NotificationJob.find({ appointment: appointment._id }).lean();
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(
    jobs.filter(({ eventType }) => eventType === 'appointment_cancelled').length,
    1
  );
  assert.equal(
    jobs.find(({ eventType }) => eventType === 'appointment_reminder').status,
    'cancelled'
  );
  assert.equal(JSON.stringify(jobs).includes('patient request'), false);
});


test('reschedule versus cancellation schedules notifications only for the committed CAS winner', async () => {
  const appointment = await create('10:30', '724');
  const outcomes = await Promise.allSettled([
    appointmentService.rescheduleAppointment(
      appointment._id,
      { date: core.date, startTime: '14:30' },
      staff.admin._id
    ),
    appointmentService.cancelAppointment(
      appointment._id,
      staff.admin._id,
      'race'
    ),
  ]);
  assert.equal(outcomes.filter(({ status }) => status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter(({ status }) => status === 'rejected').length, 1);
  const jobs = await NotificationJob.find({
    appointment: appointment._id,
    eventType: { $in: ['appointment_rescheduled', 'appointment_cancelled'] },
  }).lean();
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].status, 'pending');
});


test('two competing reschedules create one event and one replacement reminder', async () => {
  const appointment = await create('11:30', '725');
  const outcomes = await Promise.allSettled([
    appointmentService.rescheduleAppointment(
      appointment._id,
      { date: core.date, startTime: '15:30' },
      staff.admin._id
    ),
    appointmentService.rescheduleAppointment(
      appointment._id,
      { date: core.date, startTime: '16:30' },
      staff.admin._id
    ),
  ]);
  assert.equal(outcomes.filter(({ status }) => status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter(({ status }) => status === 'rejected').length, 1);
  assert.equal(
    await NotificationJob.countDocuments({
      appointment: appointment._id,
      eventType: 'appointment_rescheduled',
    }),
    1
  );
  const reminders = await NotificationJob.find({
    appointment: appointment._id,
    eventType: 'appointment_reminder',
  }).lean();
  assert.equal(reminders.filter(({ status }) => status === 'pending').length, 1);
  assert.equal(reminders.filter(({ status }) => status === 'cancelled').length, 1);
});


test('reschedule versus check-in creates effects only for the committed CAS winner', async () => {
  await Clinic.updateOne(
    { key: 'default' },
    { $set: { 'bookingSettings.autoConfirmAppointments': true } }
  );
  const appointment = await create('12:00', '732');
  const outcomes = await Promise.allSettled([
    appointmentService.rescheduleAppointment(
      appointment._id,
      { date: core.date, startTime: '14:00' },
      staff.admin._id
    ),
    appointmentService.updateStatus(appointment._id, 'checked_in'),
  ]);
  assert.equal(outcomes.filter(({ status }) => status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter(({ status }) => status === 'rejected').length, 1);

  const stored = await Appointment.findById(appointment._id).lean();
  const rescheduleJobs = await NotificationJob.find({
    appointment: appointment._id,
    eventType: 'appointment_rescheduled',
  }).lean();
  if (stored.status === 'checked_in') {
    assert.equal(rescheduleJobs.length, 0);
    assert.equal(
      await NotificationJob.countDocuments({
        appointment: appointment._id,
        eventType: 'appointment_reminder',
        status: 'cancelled',
      }),
      1
    );
  }
  else {
    assert.equal(stored.status, 'confirmed');
    assert.equal(stored.scheduleRevision, 1);
    assert.equal(rescheduleJobs.length, 1);
    assert.equal(rescheduleJobs[0].status, 'pending');
  }
});


test('inside-24h bookings intentionally skip reminders while booking still succeeds', async () => {
  const soon = new Date(Date.now() + 23 * 60 * 60 * 1000);
  const stored = await Appointment.create({
    confirmationCode: `DC-${'A'.repeat(16)}`,
    patientName: 'Soon Patient',
    patientPhone: '+37499123099',
    patientEmail: 'soon@example.test',
    dentist: core.dentist._id,
    service: core.service._id,
    dentistSnapshot: {
      firstName: 'Ani',
      lastName: 'Hakobyan',
    },
    serviceSnapshot: {
      name: 'Cleaning',
      durationMinutes: 60,
    },
    priceSnapshot: {
      priceType: 'fixed',
      priceFrom: 1,
      currency: 'AMD',
    },
    date: core.date,
    startTime: '09:00',
    endTime: '10:00',
    startAt: soon,
    endAt: new Date(soon.getTime() + 60 * 60 * 1000),
    lockKeys: [`${core.date}:540`],
    privacyConsentAt: new Date(),
    privacyPolicyVersion: '2026-01',
  });
  const { scheduleReminder } = await import(
    '../src/modules/notifications/notificationOutbox.service.js'
  );
  await scheduleReminder(stored, { now: new Date() });
  assert.equal(
    await NotificationJob.countDocuments({
      appointment: stored._id,
      eventType: 'appointment_reminder',
    }),
    0
  );

  const exactNow = new Date();
  stored.startAt = new Date(exactNow.getTime() + 24 * 60 * 60 * 1000);
  stored.endAt = new Date(stored.startAt.getTime() + 60 * 60 * 1000);
  stored.scheduleRevision = 1;
  await scheduleReminder(stored, { now: exactNow });
  assert.equal(
    await NotificationJob.countDocuments({
      appointment: stored._id,
      eventType: 'appointment_reminder',
    }),
    1
  );
});


test('staff-created booking does not notify reception or send a booking lifecycle email', async () => {
  const appointment = await appointmentService.createAdminAppointment(
    {
      ...booking('17:00', '721'),
      source: 'phone',
      consentMethod: 'phone',
      internalNote: 'sensitive staff note',
    },
    staff.receptionist._id
  );
  const jobs = await NotificationJob.find({ appointment: appointment._id }).lean();
  assert.deepEqual(jobs.map(({ eventType }) => eventType), ['appointment_reminder']);
  assert.equal(JSON.stringify(jobs).includes('sensitive staff note'), false);
});
