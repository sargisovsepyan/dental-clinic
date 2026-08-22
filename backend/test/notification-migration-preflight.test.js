import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/dental_clinic_test';
process.env.JWT_SECRET = 'test-only-secret-that-is-at-least-thirty-two-characters';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.NOTIFICATIONS_ENABLED = 'true';
process.env.CLINIC_NOTIFICATION_EMAIL = 'reception@example.test';

const {
  connectReplTestDatabase: connectTestDatabase,
  clearReplTestDatabase: clearTestDatabase,
  disconnectReplTestDatabase: disconnectTestDatabase,
} = await import('../test-support/replDatabase.js');
const { seedCore, publicBooking } = await import('../test-support/fixtures.js');
const { default: Appointment } = await import('../src/modules/appointments/appointment.model.js');
const { default: BookingIdempotency } = await import(
  '../src/modules/appointments/bookingIdempotency.model.js'
);
const { default: NotificationJob } = await import(
  '../src/modules/notifications/notificationJob.model.js'
);
const notificationMigration = await import(
  '../src/migrations/20260822_011_appointment_notifications.js'
);
const {
  migrationManifest,
} = await import('../src/migrations/runner.js');
const {
  verifyCriticalIndexes,
  verifyDataInvariants,
  verifyNotificationOutbox,
} = await import('../src/production/preflight.service.js');
const { default: mongoose } = await import('mongoose');
const appointmentService = await import(
  '../src/modules/appointments/appointment.service.js'
);

let core;

before(async () => {
  await connectTestDatabase();
  await Promise.all([
    Appointment.init(),
    BookingIdempotency.init(),
    NotificationJob.init(),
  ]);
});
beforeEach(async () => {
  await clearTestDatabase();
  core = await seedCore();
});
after(disconnectTestDatabase);


test('migration 011 is dry-run safe, preserves unknown locale, versions legacy hashes, and seeds one reminder', async () => {
  const appointment = await appointmentService.createAppointment({
    ...publicBooking(core, '09:00', '901'),
    locale: 'en',
  });
  await NotificationJob.deleteMany({ appointment: appointment._id });
  await Appointment.collection.updateOne(
    { _id: appointment._id },
    {
      $unset: {
        scheduleRevision: '',
        notificationLocale: '',
      },
    }
  );
  const record = await BookingIdempotency.create({
    keyHash: 'a'.repeat(64),
    requestHash: 'b'.repeat(64),
    requestHashVersion: 'v2',
    appointment: appointment._id,
    responseSnapshot: { id: appointment._id },
    expiresAt: new Date(Date.now() + 60_000),
  });
  await BookingIdempotency.collection.updateOne(
    { _id: record._id },
    { $unset: { requestHashVersion: '' } }
  );

  const dry = await notificationMigration.run({ dryRun: true });
  assert.equal(dry.appointmentsMissingScheduleRevision, 1);
  assert.equal(dry.appointmentsMissingNotificationLocale, 1);
  assert.equal(dry.idempotencyRecordsMissingHashVersion, 1);
  assert.equal(dry.eligibleLegacyReminders, 1);
  assert.equal(await NotificationJob.countDocuments(), 0);
  assert.equal(
    (await Appointment.collection.findOne({ _id: appointment._id }))
      .scheduleRevision,
    undefined
  );

  const applied = await notificationMigration.run({ dryRun: false });
  assert.equal(applied.scheduleRevisionsInitialized, 1);
  assert.equal(applied.unknownLocalesMarked, 1);
  assert.equal(applied.idempotencyHashVersionsPreserved, 1);
  assert.equal(applied.remindersScheduled, 1);
  const stored = await Appointment.collection.findOne({ _id: appointment._id });
  assert.equal(stored.scheduleRevision, 0);
  assert.equal(stored.notificationLocale, null);
  assert.equal(
    (await BookingIdempotency.collection.findOne({ _id: record._id }))
      .requestHashVersion,
    'v1'
  );
  const reminder = await NotificationJob.findOne({ appointment: appointment._id })
    .lean();
  assert.equal(reminder.eventType, 'appointment_reminder');
  assert.equal(reminder.locale, null);

  const repeated = await notificationMigration.run({ dryRun: false });
  assert.equal(repeated.remindersScheduled, 0);
  assert.equal(await NotificationJob.countDocuments(), 1);
  assert.equal(migrationManifest.at(-1).version, notificationMigration.version);
});


test('migration 011 refuses malformed revisions before any partial mutation', async () => {
  const appointment = await appointmentService.createAppointment({
    ...publicBooking(core, '10:00', '902'),
    locale: 'hy',
  });
  await NotificationJob.deleteMany({ appointment: appointment._id });
  await Appointment.collection.updateOne(
    { _id: appointment._id },
    {
      $set: { scheduleRevision: -1 },
      $unset: { notificationLocale: '' },
    }
  );
  await assert.rejects(
    notificationMigration.run({ dryRun: false }),
    /preconditions/
  );
  const stored = await Appointment.collection.findOne({ _id: appointment._id });
  assert.equal(stored.scheduleRevision, -1);
  assert.equal(stored.notificationLocale, undefined);
  assert.equal(await NotificationJob.countDocuments(), 0);
});


test('migration 011 rejects array-shaped hashes and unsafe legacy reminder data before writes', async () => {
  const appointment = await appointmentService.createAppointment({
    ...publicBooking(core, '10:30', '903'),
    locale: 'ru',
  });
  await NotificationJob.deleteMany({ appointment: appointment._id });
  await Appointment.collection.updateOne(
    { _id: appointment._id },
    {
      $set: {
        patientEmail: 'patient@example.test,attacker@example.test',
        'serviceSnapshot.name': ['Cleaning'],
      },
      $unset: { notificationLocale: '' },
    }
  );
  const record = await BookingIdempotency.create({
    keyHash: 'c'.repeat(64),
    requestHash: 'd'.repeat(64),
    requestHashVersion: 'v2',
    appointment: appointment._id,
    responseSnapshot: { id: appointment._id },
    expiresAt: new Date(Date.now() + 60_000),
  });
  await BookingIdempotency.collection.updateOne(
    { _id: record._id },
    { $set: { requestHashVersion: ['v1', 'v2'] } }
  );

  const dry = await notificationMigration.run({ dryRun: true });
  assert.equal(dry.idempotencyRecordsWithInvalidHashVersion, 1);
  assert.equal(dry.invalidLegacyReminderCandidates, 1);
  await assert.rejects(
    notificationMigration.run({ dryRun: false }),
    /preconditions/
  );

  const storedAppointment = await Appointment.collection.findOne({
    _id: appointment._id,
  });
  const storedRecord = await BookingIdempotency.collection.findOne({
    _id: record._id,
  });
  assert.equal(storedAppointment.notificationLocale, undefined);
  assert.deepEqual(storedRecord.requestHashVersion, ['v1', 'v2']);
  assert.equal(await NotificationJob.countDocuments(), 0);
});


test('migration 011 preserves an explicit supported legacy locale', async () => {
  const appointment = await appointmentService.createAppointment({
    ...publicBooking(core, '11:00', '904'),
    locale: 'en',
  });
  await NotificationJob.deleteMany({ appointment: appointment._id });

  const applied = await notificationMigration.run({ dryRun: false });
  assert.equal(applied.remindersScheduled, 1);
  const reminder = await NotificationJob.findOne({
    appointment: appointment._id,
    eventType: 'appointment_reminder',
  }).lean();
  assert.equal(reminder.locale, 'en');
});


test('notification indexes have exact production options and names', async () => {
  const failures = await verifyCriticalIndexes(
    mongoose.connection.db,
    [
      {
        collection: 'notificationjobs',
        key: { dedupeKey: 1 },
        unique: true,
        name: 'unique_notification_logical_event',
      },
      {
        collection: 'notificationjobs',
        key: { status: 1, nextAttemptAt: 1, _id: 1 },
        name: 'notification_due_claim',
      },
      {
        collection: 'notificationjobs',
        key: { status: 1, leaseExpiresAt: 1, _id: 1 },
        name: 'notification_expired_lease',
      },
      {
        collection: 'notificationjobs',
        key: { purgeAt: 1 },
        expireAfterSeconds: 0,
        name: 'notification_terminal_retention',
      },
    ]
  );
  assert.deepEqual(failures, []);
});


test('notification preflight accepts a healthy actionable outbox', async () => {
  await appointmentService.createAppointment({
    ...publicBooking(core, '11:30', '907'),
    locale: 'ru',
  });
  const result = await verifyNotificationOutbox();
  assert.equal(result.ok, true);
  assert.equal(result.invalidShape, 0);
  assert.equal(result.patientJobsWithoutEmail, 0);
  assert.equal(result.activeProcessingLeases, 0);
});


test('notification preflight is read-only and blocks malformed, orphan, leased, and SMS jobs', async () => {
  const beforeAppointments = await Appointment.countDocuments();
  const orphanId = new mongoose.Types.ObjectId();
  await NotificationJob.collection.insertOne({
    dedupeKey: `appointment:${orphanId}:test:appointment_reminder:appointment_patient:sms`,
    appointment: orphanId,
    eventType: 'appointment_reminder',
    eventRevision: 0,
    scheduleRevision: 0,
    channel: 'sms',
    recipientKind: 'appointment_patient',
    locale: null,
    dueAt: new Date(),
    nextAttemptAt: new Date(),
    status: 'processing',
    attempts: 1,
    maxAttempts: 8,
    eventSnapshot: {},
    leaseOwner: 'worker',
    leaseToken: 'token',
    leaseExpiresAt: new Date(Date.now() + 60_000),
    claimedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const rawBefore = await NotificationJob.collection.find({}).toArray();
  const result = await verifyNotificationOutbox();
  const rawAfter = await NotificationJob.collection.find({}).toArray();
  assert.equal(result.ok, false);
  assert.equal(result.orphanAppointments, 1);
  assert.equal(result.unsupportedActiveSms, 1);
  assert.equal(result.activeProcessingLeases, 1);
  assert.equal(result.metrics.expiredProcessingLeases, 0);
  assert.deepEqual(rawAfter, rawBefore);
  assert.equal(await Appointment.countDocuments(), beforeAppointments);
});


test('notification preflight rejects unsafe nonempty patient mailboxes without mutation', async () => {
  const appointment = await appointmentService.createAppointment({
    ...publicBooking(core, '12:00', '905'),
    locale: 'hy',
  });
  await Appointment.collection.updateOne(
    { _id: appointment._id },
    { $set: { patientEmail: 'patient@example.test\r\nBcc: attacker@example.test' } }
  );
  const before = await NotificationJob.collection.find({}).toArray();

  const result = await verifyNotificationOutbox();
  assert.equal(result.ok, false);
  assert.equal(result.patientJobsWithoutEmail, 2);
  assert.deepEqual(await NotificationJob.collection.find({}).toArray(), before);
});


test('notification preflight reports expired leases as recoverable queue state', async () => {
  const appointment = await appointmentService.createAppointment({
    ...publicBooking(core, '12:30', '908'),
    locale: 'hy',
  });
  const now = new Date();
  await NotificationJob.collection.updateOne(
    {
      appointment: appointment._id,
      eventType: 'appointment_received',
    },
    {
      $set: {
        status: 'processing',
        attempts: 1,
        leaseOwner: 'stopped-worker',
        leaseToken: 'opaque-token',
        leaseExpiresAt: new Date(now.getTime() - 1),
        claimedAt: new Date(now.getTime() - 60_000),
      },
    }
  );

  const result = await verifyNotificationOutbox({ now });
  assert.equal(result.ok, true);
  assert.equal(result.activeProcessingLeases, 0);
  assert.equal(result.metrics.expiredProcessingLeases, 1);
});


test('notification preflight rejects array-shaped lease ownership fields', async () => {
  const appointment = await appointmentService.createAppointment({
    ...publicBooking(core, '14:00', '909'),
    locale: 'hy',
  });
  const now = new Date();
  await NotificationJob.collection.updateOne(
    {
      appointment: appointment._id,
      eventType: 'appointment_received',
    },
    {
      $set: {
        status: 'processing',
        attempts: 1,
        leaseOwner: ['worker'],
        leaseToken: ['token'],
        leaseExpiresAt: new Date(now.getTime() + 60_000),
        claimedAt: now,
      },
    }
  );

  const result = await verifyNotificationOutbox({ now });
  assert.equal(result.ok, false);
  assert.equal(result.invalidProcessingLeases, 1);
});


test('production data preflight rejects multivalued hash versions and consent evidence', async () => {
  const appointment = await appointmentService.createAppointment({
    ...publicBooking(core, '13:00', '906'),
    locale: 'hy',
  });
  const record = await BookingIdempotency.create({
    keyHash: 'e'.repeat(64),
    requestHash: 'f'.repeat(64),
    requestHashVersion: 'v2',
    appointment: appointment._id,
    responseSnapshot: { id: appointment._id },
    expiresAt: new Date(Date.now() + 60_000),
  });
  await Promise.all([
    BookingIdempotency.collection.updateOne(
      { _id: record._id },
      { $set: { requestHashVersion: ['v1', 'v2'] } }
    ),
    Appointment.collection.updateOne(
      { _id: appointment._id },
      { $set: { privacyConsentMethod: ['website'] } }
    ),
  ]);

  const result = await verifyDataInvariants();
  assert.equal(result.invalidBookingIdempotencyRecords, 1);
  assert.equal(result.invalidAppointmentPrivacyEvidence, 1);
});
