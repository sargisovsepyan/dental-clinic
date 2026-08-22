import { isSafeSingleMailbox } from '../../mail/mail.validation.js';
import { SUPPORTED_LOCALES } from '../../i18n/localization.js';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_EVENT_TYPES,
  NOTIFICATION_RECIPIENT_KINDS,
  NOTIFICATION_STATUSES,
} from './notification.constants.js';


const VERIFIED_APPOINTMENT_CONSENT_METHODS = new Set([
  'website',
  'phone',
  'in_person',
]);


const isExactDate = (value) => (
  value instanceof Date && Number.isFinite(value.getTime())
);


const isObjectId = (value) => value?._bsontype === 'ObjectId';


const isPlainObject = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};


const isBoundedString = (value, maximum, { allowEmpty = false } = {}) => (
  typeof value === 'string' &&
  value.length <= maximum &&
  (allowEmpty || value.trim().length > 0)
);


const isNonnegativeInteger = (value) => (
  Number.isInteger(value) && value >= 0
);


const isSupportedNotificationLocale = (value) => (
  value === null || SUPPORTED_LOCALES.includes(value)
);


const hasVerifiedAppointmentPrivacyEvidence = (appointment) => (
  isExactDate(appointment?.privacyConsentAt) &&
  typeof appointment?.privacyConsentMethod === 'string' &&
  VERIFIED_APPOINTMENT_CONSENT_METHODS.has(
    appointment.privacyConsentMethod
  ) &&
  typeof appointment?.privacyPolicyVersion === 'string' &&
  /^(?:[0-9]{4}-[0-9]{2}(?:\.[0-9]+)?)$/.test(
    appointment.privacyPolicyVersion
  )
);


const isValidAppointmentOccurrenceSource = (appointment) => (
  isExactDate(appointment?.startAt) &&
  isExactDate(appointment?.endAt) &&
  appointment.endAt > appointment.startAt &&
  isBoundedString(appointment?.serviceSnapshot?.name, 150) &&
  isBoundedString(appointment?.dentistSnapshot?.firstName, 150) &&
  isBoundedString(appointment?.dentistSnapshot?.lastName, 150)
);


const assessLegacyReminderAppointment = (appointment, cutoff) => {
  if (
    !['pending', 'confirmed'].includes(appointment?.status) ||
    !isExactDate(appointment?.startAt) ||
    appointment.startAt < cutoff
  ) {
    return { candidate: false, eligible: false, invalid: false };
  }

  const email = appointment.patientEmail;
  if (email === undefined || email === null || email === '') {
    return { candidate: false, eligible: false, invalid: false };
  }

  const scheduleRevisionValid = (
    appointment.scheduleRevision === undefined ||
    isNonnegativeInteger(appointment.scheduleRevision)
  );
  const localeValid = (
    appointment.notificationLocale === undefined ||
    isSupportedNotificationLocale(appointment.notificationLocale)
  );
  const eligible = (
    isSafeSingleMailbox(email) &&
    scheduleRevisionValid &&
    localeValid &&
    hasVerifiedAppointmentPrivacyEvidence(appointment) &&
    isValidAppointmentOccurrenceSource(appointment)
  );
  return {
    candidate: true,
    eligible,
    invalid: !eligible,
  };
};


const isValidLocalizedNames = (value) => {
  if (value === undefined) return true;
  if (!isPlainObject(value)) return false;
  return Object.entries(value).every(([locale, name]) => (
    SUPPORTED_LOCALES.includes(locale) &&
    isBoundedString(name, 150)
  ));
};


const isValidOccurrenceSnapshot = (value) => (
  isPlainObject(value) &&
  isExactDate(value.startAt) &&
  isExactDate(value.endAt) &&
  value.endAt > value.startAt &&
  isBoundedString(value.serviceName, 150) &&
  isValidLocalizedNames(value.serviceNames) &&
  isBoundedString(value.dentistName, 301)
);


const validEventRecipientPair = (eventType, recipientKind) => (
  eventType === 'clinic_new_booking'
    ? recipientKind === 'clinic_reception'
    : recipientKind === 'appointment_patient'
);


const validIdentityForEvent = (job, identity) => {
  const revision = String(job.eventRevision);
  switch (job.eventType) {
    case 'appointment_received':
    case 'clinic_new_booking':
      return (
        identity === 'created' &&
        job.eventRevision === 0 &&
        job.scheduleRevision === 0
      );
    case 'appointment_confirmed':
      return identity === 'created'
        ? job.eventRevision === 0 && job.scheduleRevision === 0
        : identity === `mutation:${revision}`;
    case 'appointment_rescheduled':
    case 'appointment_reminder':
      return (
        identity === `schedule:${revision}` &&
        job.scheduleRevision === job.eventRevision
      );
    case 'appointment_cancelled':
      return identity === `mutation:${revision}`;
    default:
      return false;
  }
};


const hasValidDedupeKey = (job) => {
  if (!isBoundedString(job.dedupeKey, 300)) return false;
  const prefix = `appointment:${String(job.appointment)}:`;
  const suffix = `:${job.eventType}:${job.recipientKind}:${job.channel}`;
  if (!job.dedupeKey.startsWith(prefix) || !job.dedupeKey.endsWith(suffix)) {
    return false;
  }
  const identity = job.dedupeKey.slice(
    prefix.length,
    job.dedupeKey.length - suffix.length
  );
  return validIdentityForEvent(job, identity);
};


const isValidNotificationJobShape = (job) => {
  if (
    !isObjectId(job?.appointment) ||
    !NOTIFICATION_EVENT_TYPES.includes(job.eventType) ||
    !NOTIFICATION_CHANNELS.includes(job.channel) ||
    !NOTIFICATION_RECIPIENT_KINDS.includes(job.recipientKind) ||
    !NOTIFICATION_STATUSES.includes(job.status) ||
    !validEventRecipientPair(job.eventType, job.recipientKind) ||
    !isNonnegativeInteger(job.eventRevision) ||
    !isNonnegativeInteger(job.scheduleRevision) ||
    !isSupportedNotificationLocale(job.locale) ||
    !isExactDate(job.dueAt) ||
    !isExactDate(job.nextAttemptAt) ||
    !isNonnegativeInteger(job.attempts) ||
    !Number.isInteger(job.maxAttempts) ||
    job.maxAttempts < 1 ||
    job.maxAttempts > 50 ||
    job.attempts > job.maxAttempts ||
    !isPlainObject(job.eventSnapshot) ||
    !isValidOccurrenceSnapshot(job.eventSnapshot.after) ||
    !hasValidDedupeKey(job)
  ) {
    return false;
  }

  if (job.eventType === 'appointment_rescheduled') {
    return isValidOccurrenceSnapshot(job.eventSnapshot.before);
  }
  return job.eventSnapshot.before === undefined || job.eventSnapshot.before === null;
};


export {
  assessLegacyReminderAppointment,
  hasVerifiedAppointmentPrivacyEvidence,
  isExactDate,
  isNonnegativeInteger,
  isObjectId,
  isPlainObject,
  isSupportedNotificationLocale,
  isValidAppointmentOccurrenceSource,
  isValidNotificationJobShape,
  isValidOccurrenceSnapshot,
};
