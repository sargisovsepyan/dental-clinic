const CRITICAL_INDEXES = Object.freeze([
  { collection: 'users', key: { email: 1 }, unique: true },
  { collection: 'sessions', key: { tokenHash: 1 }, unique: true },
  { collection: 'sessions', key: { expiresAt: 1 }, expireAfterSeconds: 0 },
  { collection: 'sessions', key: { user: 1, revokedAt: 1, createdAt: -1 } },
  { collection: 'sessions', key: { consumedTokenHashes: 1 } },
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
  { collection: 'appointments', key: { dentist: 1, date: 1, startAt: 1 } },
  { collection: 'appointments', key: { date: 1, status: 1 } },
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
    collection: 'beforeaftercases',
    key: { isActive: 1, isFeatured: -1, sortOrder: 1, createdAt: -1 },
  },
  {
    collection: 'beforeaftercases',
    key: { publicationStatus: 1, consentStatus: 1, isActive: 1 },
  },
]);


export default CRITICAL_INDEXES;
