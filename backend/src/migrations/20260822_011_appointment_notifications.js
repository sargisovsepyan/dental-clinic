import env from '../config/env.js';
import Appointment from '../modules/appointments/appointment.model.js';
import BookingIdempotency from '../modules/appointments/bookingIdempotency.model.js';
import NotificationJob from '../modules/notifications/notificationJob.model.js';
import {
  REMINDER_LEAD_MS,
} from '../modules/notifications/notification.constants.js';
import {
  dedupeKey,
  occurrenceSnapshot,
} from '../modules/notifications/notificationOutbox.service.js';
import {
  assessLegacyReminderAppointment,
} from '../modules/notifications/notificationIntegrity.js';


const version = '20260822_011_appointment_notifications';
const description =
  'Initialize notification revisions, preserve idempotency hash versions, and seed future reminders';


const invalidNonnegativeInteger = (field) => ({
  $expr: {
    $cond: [
      {
        $in: [
          { $type: `$${field}` },
          ['int', 'long', 'double', 'decimal'],
        ],
      },
      {
        $or: [
          { $lt: [`$${field}`, 0] },
          { $ne: [`$${field}`, { $trunc: `$${field}` }] },
        ],
      },
      true,
    ],
  },
});


const invalidExactStringEnum = (field, allowed) => ({
  [field]: { $exists: true },
  $expr: {
    $eq: [
      {
        $and: [
          { $eq: [{ $type: `$${field}` }, 'string'] },
          { $in: [`$${field}`, allowed] },
        ],
      },
      false,
    ],
  },
});


const invalidExactNullableStringEnum = (field, allowed) => ({
  [field]: { $exists: true },
  $expr: {
    $eq: [
      {
        $or: [
          { $eq: [`$${field}`, null] },
          {
            $and: [
              { $eq: [{ $type: `$${field}` }, 'string'] },
              { $in: [`$${field}`, allowed] },
            ],
          },
        ],
      },
      false,
    ],
  },
});


const legacyReminderProjection = Object.freeze({
  _id: 1,
  status: 1,
  patientEmail: 1,
  startAt: 1,
  endAt: 1,
  serviceSnapshot: 1,
  dentistSnapshot: 1,
  privacyConsentAt: 1,
  privacyConsentMethod: 1,
  privacyPolicyVersion: 1,
  scheduleRevision: 1,
  notificationLocale: 1,
});


const scanLegacyReminderCandidates = async (cutoff) => {
  let eligibleLegacyReminders = 0;
  let invalidLegacyReminderCandidates = 0;
  const cursor = Appointment.collection.find(
    { startAt: { $type: 'date', $gte: cutoff } },
    { projection: legacyReminderProjection }
  ).sort({ _id: 1 });
  for await (const appointment of cursor) {
    const assessment = assessLegacyReminderAppointment(appointment, cutoff);
    if (assessment.eligible) eligibleLegacyReminders += 1;
    if (assessment.invalid) invalidLegacyReminderCandidates += 1;
  }
  return { eligibleLegacyReminders, invalidLegacyReminderCandidates };
};


const run = async ({
  dryRun = true,
  assertLease = async () => {},
  now = new Date(),
}) => {
  const cutoff = new Date(now.getTime() + REMINDER_LEAD_MS);
  const [
    appointmentsMissingScheduleRevision,
    appointmentsWithInvalidScheduleRevision,
    appointmentsMissingNotificationLocale,
    appointmentsWithInvalidNotificationLocale,
    idempotencyRecordsMissingHashVersion,
    idempotencyRecordsWithInvalidHashVersion,
  ] = await Promise.all([
    Appointment.collection.countDocuments({ scheduleRevision: { $exists: false } }),
    Appointment.collection.countDocuments({
      scheduleRevision: { $exists: true },
      ...invalidNonnegativeInteger('scheduleRevision'),
    }),
    Appointment.collection.countDocuments({ notificationLocale: { $exists: false } }),
    Appointment.collection.countDocuments(
      invalidExactNullableStringEnum('notificationLocale', ['hy', 'ru', 'en'])
    ),
    BookingIdempotency.collection.countDocuments({
      requestHashVersion: { $exists: false },
    }),
    BookingIdempotency.collection.countDocuments(
      invalidExactStringEnum('requestHashVersion', ['v1', 'v2'])
    ),
  ]);
  const {
    eligibleLegacyReminders,
    invalidLegacyReminderCandidates,
  } = await scanLegacyReminderCandidates(cutoff);

  const result = {
    appointmentsMissingScheduleRevision,
    appointmentsWithInvalidScheduleRevision,
    appointmentsMissingNotificationLocale,
    appointmentsWithInvalidNotificationLocale,
    idempotencyRecordsMissingHashVersion,
    idempotencyRecordsWithInvalidHashVersion,
    eligibleLegacyReminders,
    invalidLegacyReminderCandidates,
    scheduleRevisionsInitialized: 0,
    unknownLocalesMarked: 0,
    idempotencyHashVersionsPreserved: 0,
    remindersScheduled: 0,
  };
  if (dryRun) {
    return result;
  }
  if (
    appointmentsWithInvalidScheduleRevision > 0 ||
    appointmentsWithInvalidNotificationLocale > 0 ||
    idempotencyRecordsWithInvalidHashVersion > 0 ||
    invalidLegacyReminderCandidates > 0
  ) {
    throw new Error('Notification migration preconditions are not satisfied');
  }

  await assertLease();
  const [scheduleRevisions, locales, hashVersions] = await Promise.all([
    Appointment.collection.updateMany(
      { scheduleRevision: { $exists: false } },
      { $set: { scheduleRevision: 0 } }
    ),
    Appointment.collection.updateMany(
      { notificationLocale: { $exists: false } },
      { $set: { notificationLocale: null } }
    ),
    BookingIdempotency.collection.updateMany(
      { requestHashVersion: { $exists: false } },
      { $set: { requestHashVersion: 'v1' } }
    ),
  ]);

  let remindersScheduled = 0;
  let processed = 0;
  const cursor = Appointment.collection.find(
    { startAt: { $type: 'date', $gte: cutoff } },
    { projection: legacyReminderProjection }
  ).sort({ _id: 1 });
  for await (const appointment of cursor) {
    const assessment = assessLegacyReminderAppointment(appointment, cutoff);
    if (!assessment.eligible) continue;
    if (processed % 100 === 0) {
      await assertLease();
    }
    const scheduleRevision = Number(appointment.scheduleRevision || 0);
    const key = dedupeKey({
      appointmentId: appointment._id,
      identity: `schedule:${scheduleRevision}`,
      eventType: 'appointment_reminder',
      recipientKind: 'appointment_patient',
      channel: 'email',
    });
    const dueAt = new Date(
      new Date(appointment.startAt).getTime() - REMINDER_LEAD_MS
    );
    const scheduled = await NotificationJob.updateOne(
      { dedupeKey: key },
      {
        $setOnInsert: {
          dedupeKey: key,
          appointment: appointment._id,
          eventType: 'appointment_reminder',
          eventRevision: scheduleRevision,
          scheduleRevision,
          channel: 'email',
          recipientKind: 'appointment_patient',
          locale: appointment.notificationLocale || null,
          dueAt,
          nextAttemptAt: dueAt,
          status: 'pending',
          attempts: 0,
          maxAttempts: env.NOTIFICATION_MAX_ATTEMPTS,
          eventSnapshot: { after: occurrenceSnapshot(appointment) },
        },
      },
      { upsert: true }
    );
    remindersScheduled += scheduled.upsertedCount;
    processed += 1;
  }
  await assertLease();

  return {
    ...result,
    scheduleRevisionsInitialized: scheduleRevisions.modifiedCount,
    unknownLocalesMarked: locales.modifiedCount,
    idempotencyHashVersionsPreserved: hashVersions.modifiedCount,
    remindersScheduled,
  };
};


export { version, description, run };
