const NOTIFICATION_CHANNELS = Object.freeze([
  'email',
  'sms',
]);

const NOTIFICATION_EVENT_TYPES = Object.freeze([
  'appointment_received',
  'appointment_confirmed',
  'appointment_rescheduled',
  'appointment_cancelled',
  'appointment_reminder',
  'clinic_new_booking',
]);

const NOTIFICATION_RECIPIENT_KINDS = Object.freeze([
  'appointment_patient',
  'clinic_reception',
]);

const NOTIFICATION_STATUSES = Object.freeze([
  'pending',
  'processing',
  'retry',
  'sent',
  'failed',
  'cancelled',
]);

const ACTIONABLE_NOTIFICATION_STATUSES = Object.freeze([
  'pending',
  'processing',
  'retry',
]);

const PATIENT_LIFECYCLE_EVENTS = Object.freeze([
  'appointment_received',
  'appointment_confirmed',
  'appointment_rescheduled',
  'appointment_reminder',
]);

const REMINDER_LEAD_MS = 24 * 60 * 60 * 1000;

export {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_EVENT_TYPES,
  NOTIFICATION_RECIPIENT_KINDS,
  NOTIFICATION_STATUSES,
  ACTIONABLE_NOTIFICATION_STATUSES,
  PATIENT_LIFECYCLE_EVENTS,
  REMINDER_LEAD_MS,
};
