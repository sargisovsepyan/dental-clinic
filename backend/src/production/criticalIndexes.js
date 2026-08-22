const CRITICAL_INDEXES = Object.freeze([
  { collection: 'users', key: { email: 1 }, unique: true },
  { collection: 'sessions', key: { tokenHash: 1 }, unique: true },
  { collection: 'sessions', key: { expiresAt: 1 }, expireAfterSeconds: 0 },
  { collection: 'sessions', key: { user: 1, revokedAt: 1, createdAt: -1 } },
  {
    collection: 'refreshreplayhistories',
    key: { tokenHash: 1 },
    unique: true,
  },
  {
    collection: 'refreshreplayhistories',
    key: { expiresAt: 1 },
    expireAfterSeconds: 0,
  },
  { collection: 'onetimetokens', key: { tokenHash: 1 }, unique: true },
  { collection: 'onetimetokens', key: { expiresAt: 1 }, expireAfterSeconds: 0 },
  { collection: 'onetimetokens', key: { user: 1, purpose: 1, consumedAt: 1 } },
  { collection: 'servicecategories', key: { slug: 1 }, unique: true },
  { collection: 'servicecategories', key: { isActive: 1, sortOrder: 1 } },
  { collection: 'services', key: { slug: 1 }, unique: true },
  { collection: 'services', key: { category: 1, isActive: 1, sortOrder: 1 } },
  { collection: 'services', key: { isFeatured: 1, isActive: 1 } },
  { collection: 'dentists', key: { slug: 1 }, unique: true },
  { collection: 'dentists', key: { isActive: 1, sortOrder: 1 } },
  { collection: 'dentists', key: { services: 1, isActive: 1, bookingEnabled: 1 } },
  { collection: 'clinics', key: { key: 1 }, unique: true },
  { collection: 'clinicclosures', key: { date: 1 }, unique: true },
  {
    collection: 'dentistscheduleexceptions',
    key: { dentist: 1, date: 1 },
    unique: true,
  },
  { collection: 'appointments', key: { confirmationCode: 1 }, unique: true },
  {
    collection: 'appointments',
    key: { dentist: 1, lockKeys: 1 },
    unique: true,
    name: 'unique_dentist_booking_lock',
  },
  {
    collection: 'appointments',
    key: { quotaReservationId: 1 },
    unique: true,
    name: 'unique_appointment_quota_reservation',
    partialFilterExpression: {
      quotaReservationId: { $type: 'objectId' },
    },
  },
  {
    collection: 'appointments',
    key: { idempotencyKeyHash: 1 },
    unique: true,
    name: 'unique_booking_idempotency_key',
    partialFilterExpression: {
      idempotencyKeyHash: { $type: 'string' },
    },
  },
  { collection: 'appointments', key: { dentist: 1, date: 1, startAt: 1 } },
  { collection: 'appointments', key: { date: 1, status: 1 } },
  {
    collection: 'bookingidempotencies',
    key: { keyHash: 1 },
    unique: true,
  },
  {
    collection: 'bookingidempotencies',
    key: { expiresAt: 1 },
    expireAfterSeconds: 0,
  },
  { collection: 'migrations', key: { version: 1 }, unique: true },
  { collection: 'migrations', key: { state: 1 } },
  {
    collection: 'phonedailyquotas',
    key: { phoneKey: 1, date: 1 },
    unique: true,
    name: 'unique_phone_daily_quota',
  },
  { collection: 'auditlogs', key: { createdAt: -1 } },
  { collection: 'auditlogs', key: { actor: 1, createdAt: -1 } },
  {
    collection: 'auditlogs',
    key: { entityType: 1, entityId: 1, createdAt: -1 },
  },
  { collection: 'mediaassets', key: { type: 1, isActive: 1, sortOrder: 1 } },
  { collection: 'mediacleanupjobs', key: { publicId: 1 }, unique: true },
  {
    collection: 'mediacleanupjobs',
    key: { status: 1, nextAttemptAt: 1, createdAt: 1 },
  },
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
    key: { appointment: 1, status: 1, eventType: 1, scheduleRevision: 1 },
    name: 'notification_appointment_reconciliation',
  },
  {
    collection: 'notificationjobs',
    key: { purgeAt: 1 },
    name: 'notification_terminal_retention',
    expireAfterSeconds: 0,
  },
  {
    collection: 'beforeaftercases',
    key: { isActive: 1, isFeatured: -1, sortOrder: 1, createdAt: -1 },
  },
  {
    collection: 'beforeaftercases',
    key: { publicationStatus: 1, consentStatus: 1, isActive: 1 },
  },
]);


export default CRITICAL_INDEXES;
