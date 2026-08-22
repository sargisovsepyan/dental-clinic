import env from '../../config/env.js';
import { SUPPORTED_LOCALES } from '../../i18n/localization.js';
import NotificationJob from './notificationJob.model.js';
import {
  ACTIONABLE_NOTIFICATION_STATUSES,
  PATIENT_LIFECYCLE_EVENTS,
  REMINDER_LEAD_MS,
} from './notification.constants.js';


const terminalPurgeAt = (now) => new Date(
  now.getTime() + env.NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000
);


const integerRevision = (value) => (
  Number.isInteger(value) && value >= 0 ? value : 0
);


const notificationLocale = (value) => (
  SUPPORTED_LOCALES.includes(value) ? value : null
);


const localizedServiceNames = (snapshot) => Object.fromEntries(
  SUPPORTED_LOCALES.flatMap((locale) => {
    const name = snapshot?.translations?.[locale]?.name;
    return typeof name === 'string' && name.trim()
      ? [[locale, name.trim()]]
      : [];
  })
);


const occurrenceSnapshot = (appointment) => ({
  startAt: new Date(appointment.startAt),
  endAt: new Date(appointment.endAt),
  serviceName: appointment.serviceSnapshot.name,
  serviceNames: localizedServiceNames(appointment.serviceSnapshot),
  dentistName: [
    appointment.dentistSnapshot.firstName,
    appointment.dentistSnapshot.lastName,
  ].filter(Boolean).join(' ').trim(),
});


const dedupeKey = ({
  appointmentId,
  identity,
  eventType,
  recipientKind,
  channel = 'email',
}) => [
  'appointment',
  String(appointmentId),
  identity,
  eventType,
  recipientKind,
  channel,
].join(':');


const scheduleNotification = async ({
  appointment,
  eventType,
  eventRevision,
  scheduleRevision = null,
  recipientKind,
  dueAt,
  eventSnapshot,
  identity,
  locale = appointment.notificationLocale,
  channel = 'email',
  session,
}) => {
  if (!env.NOTIFICATIONS_ENABLED) {
    return { upsertedCount: 0 };
  }

  const key = dedupeKey({
    appointmentId: appointment._id,
    identity,
    eventType,
    recipientKind,
    channel,
  });
  return NotificationJob.updateOne(
    { dedupeKey: key },
    {
      $setOnInsert: {
        dedupeKey: key,
        appointment: appointment._id,
        eventType,
        eventRevision,
        scheduleRevision,
        channel,
        recipientKind,
        locale: notificationLocale(locale),
        dueAt,
        nextAttemptAt: dueAt,
        status: 'pending',
        attempts: 0,
        maxAttempts: env.NOTIFICATION_MAX_ATTEMPTS,
        eventSnapshot,
      },
    },
    {
      upsert: true,
      session,
      runValidators: true,
      setDefaultsOnInsert: true,
    }
  );
};


const scheduleReminder = async (
  appointment,
  { session, now = new Date() }
) => {
  if (!appointment.patientEmail) {
    return { upsertedCount: 0 };
  }
  const dueAt = new Date(
    new Date(appointment.startAt).getTime() - REMINDER_LEAD_MS
  );
  if (dueAt < now) {
    return { upsertedCount: 0 };
  }
  const scheduleRevision = integerRevision(appointment.scheduleRevision);
  return scheduleNotification({
    appointment,
    eventType: 'appointment_reminder',
    eventRevision: scheduleRevision,
    scheduleRevision,
    recipientKind: 'appointment_patient',
    dueAt,
    eventSnapshot: { after: occurrenceSnapshot(appointment) },
    identity: `schedule:${scheduleRevision}`,
    session,
  });
};


const cancelActionableNotifications = async ({
  appointmentId,
  eventTypes,
  recipientKind = 'appointment_patient',
  cancellationCode,
  session,
  now = new Date(),
}) => {
  if (!env.NOTIFICATIONS_ENABLED) {
    return { modifiedCount: 0 };
  }
  return NotificationJob.updateMany(
    {
      appointment: appointmentId,
      recipientKind,
      eventType: { $in: eventTypes },
      status: { $in: ACTIONABLE_NOTIFICATION_STATUSES },
    },
    {
      $set: {
        status: 'cancelled',
        cancelledAt: now,
        cancellationCode,
        purgeAt: terminalPurgeAt(now),
      },
      $unset: {
        leaseOwner: '',
        leaseToken: '',
        leaseExpiresAt: '',
        claimedAt: '',
        deliveryStartedAt: '',
      },
    },
    { session }
  );
};


const scheduleCreatedNotifications = async (
  appointment,
  { session, now = new Date() }
) => {
  if (!env.NOTIFICATIONS_ENABLED) {
    return;
  }

  const snapshot = { after: occurrenceSnapshot(appointment) };
  if (appointment.source === 'website') {
    if (appointment.patientEmail) {
      const eventType = appointment.status === 'confirmed'
        ? 'appointment_confirmed'
        : 'appointment_received';
      await scheduleNotification({
        appointment,
        eventType,
        eventRevision: 0,
        scheduleRevision: integerRevision(appointment.scheduleRevision),
        recipientKind: 'appointment_patient',
        dueAt: now,
        eventSnapshot: snapshot,
        identity: 'created',
        session,
      });
    }
    await scheduleNotification({
      appointment,
      eventType: 'clinic_new_booking',
      eventRevision: 0,
      scheduleRevision: integerRevision(appointment.scheduleRevision),
      recipientKind: 'clinic_reception',
      dueAt: now,
      eventSnapshot: snapshot,
      identity: 'created',
      locale: 'hy',
      session,
    });
  }

  await scheduleReminder(appointment, { session, now });
};


const reconcileStatusNotifications = async ({
  before,
  after,
  session,
  now = new Date(),
}) => {
  if (!env.NOTIFICATIONS_ENABLED) {
    return;
  }

  if (after.status === 'confirmed') {
    await cancelActionableNotifications({
      appointmentId: after._id,
      eventTypes: [
        'appointment_received',
        'appointment_confirmed',
        'appointment_rescheduled',
      ],
      cancellationCode: 'superseded_by_confirmation',
      session,
      now,
    });
    if (after.patientEmail) {
      const resultMutationVersion = integerRevision(after.mutationVersion);
      await scheduleNotification({
        appointment: after,
        eventType: 'appointment_confirmed',
        eventRevision: resultMutationVersion,
        scheduleRevision: integerRevision(after.scheduleRevision),
        recipientKind: 'appointment_patient',
        dueAt: now,
        eventSnapshot: { after: occurrenceSnapshot(after) },
        identity: `mutation:${resultMutationVersion}`,
        session,
      });
      await scheduleReminder(after, { session, now });
    }
    return;
  }

  if (before.status !== after.status) {
    await cancelActionableNotifications({
      appointmentId: after._id,
      eventTypes: PATIENT_LIFECYCLE_EVENTS,
      cancellationCode: `appointment_${after.status}`,
      session,
      now,
    });
  }
};


const reconcileRescheduleNotifications = async ({
  before,
  after,
  session,
  now = new Date(),
}) => {
  if (!env.NOTIFICATIONS_ENABLED) {
    return;
  }
  await cancelActionableNotifications({
    appointmentId: after._id,
    eventTypes: PATIENT_LIFECYCLE_EVENTS,
    cancellationCode: 'superseded_by_reschedule',
    session,
    now,
  });

  if (after.patientEmail) {
    const scheduleRevision = integerRevision(after.scheduleRevision);
    await scheduleNotification({
      appointment: after,
      eventType: 'appointment_rescheduled',
      eventRevision: scheduleRevision,
      scheduleRevision,
      recipientKind: 'appointment_patient',
      dueAt: now,
      eventSnapshot: {
        before: occurrenceSnapshot(before),
        after: occurrenceSnapshot(after),
      },
      identity: `schedule:${scheduleRevision}`,
      session,
    });
    await scheduleReminder(after, { session, now });
  }
};


const reconcileCancellationNotifications = async ({
  before,
  after,
  session,
  now = new Date(),
}) => {
  if (!env.NOTIFICATIONS_ENABLED) {
    return;
  }
  await cancelActionableNotifications({
    appointmentId: after._id,
    eventTypes: PATIENT_LIFECYCLE_EVENTS,
    cancellationCode: 'appointment_cancelled',
    session,
    now,
  });
  if (!after.patientEmail) {
    return;
  }
  const resultMutationVersion = integerRevision(after.mutationVersion);
  await scheduleNotification({
    appointment: after,
    eventType: 'appointment_cancelled',
    eventRevision: resultMutationVersion,
    scheduleRevision: integerRevision(after.scheduleRevision),
    recipientKind: 'appointment_patient',
    dueAt: now,
    eventSnapshot: { after: occurrenceSnapshot(before) },
    identity: `mutation:${resultMutationVersion}`,
    session,
  });
};


export {
  terminalPurgeAt,
  occurrenceSnapshot,
  dedupeKey,
  scheduleNotification,
  scheduleReminder,
  cancelActionableNotifications,
  scheduleCreatedNotifications,
  reconcileStatusNotifications,
  reconcileRescheduleNotifications,
  reconcileCancellationNotifications,
};
