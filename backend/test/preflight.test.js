import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/dental_clinic_test';
process.env.JWT_SECRET = 'test-only-secret-that-is-at-least-thirty-two-characters';
process.env.CLIENT_URL = 'http://localhost:5173';

const {
  connectTestDatabase,
  disconnectTestDatabase,
} = await import('../test-support/database.js');
const { default: mongoose } = await import('mongoose');
const { default: productionModels } = await import('../src/production/models.js');
const { default: CRITICAL_INDEXES } = await import(
  '../src/production/criticalIndexes.js'
);
const {
  verifyCriticalIndexes,
  verifyMongoGuarantees,
  verifyDataInvariants,
  countUsableActiveAdmins,
  dataInvariantsPass,
} = await import('../src/production/preflight.service.js');
const {
  findDuplicateUniqueData,
} = await import('../src/production/indexManagement.service.js');
const { default: Appointment } = await import(
  '../src/modules/appointments/appointment.model.js'
);
const { default: User } = await import('../src/modules/users/user.model.js');
const { default: Session } = await import('../src/modules/sessions/session.model.js');
const { default: Clinic } = await import('../src/modules/clinic/clinic.model.js');
const { default: PhoneDailyQuota } = await import(
  '../src/modules/appointments/phoneDailyQuota.model.js'
);
const { default: ServiceCategory } = await import(
  '../src/modules/serviceCategories/serviceCategory.model.js'
);
const { default: Service } = await import(
  '../src/modules/services/service.model.js'
);
const { default: Dentist } = await import(
  '../src/modules/dentists/dentist.model.js'
);
const { default: DentistScheduleException } = await import(
  '../src/modules/dentists/dentistScheduleException.model.js'
);
const { default: BeforeAfterCase } = await import(
  '../src/modules/beforeAfter/beforeAfter.model.js'
);
const { default: BookingIdempotency } = await import(
  '../src/modules/appointments/bookingIdempotency.model.js'
);


before(async () => {
  await connectTestDatabase();
  await Promise.all(productionModels.map((Model) => Model.init()));
});

after(disconnectTestDatabase);


test('critical production indexes are verified against the actual Mongo catalog', async () => {
  assert.deepEqual(await verifyCriticalIndexes(mongoose.connection.db), []);

  await Appointment.collection.dropIndex('unique_dentist_booking_lock');
  try {
    await Appointment.collection.createIndex(
      { dentist: 1, lockKeys: 1 },
      { name: 'unique_dentist_booking_lock' }
    );
    const failures = await verifyCriticalIndexes(mongoose.connection.db);
    assert.ok(failures.some((failure) => (
      failure.collection === 'appointments' &&
      failure.issue === 'unique_option_missing'
    )));
  }
  finally {
    await Appointment.collection.dropIndex('unique_dentist_booking_lock');
    await Appointment.createIndexes();
  }

  await Session.collection.dropIndex('expiresAt_1');
  try {
    await Session.collection.createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 60 }
    );
    const failures = await verifyCriticalIndexes(mongoose.connection.db);
    assert.ok(failures.some((failure) => (
      failure.collection === 'sessions' &&
      failure.issue === 'ttl_option_mismatch'
    )));
  }
  finally {
    await Session.collection.dropIndex('expiresAt_1');
    await Session.createIndexes();
  }

  await Appointment.collection.dropIndex('date_1_status_1');
  try {
    await Appointment.collection.createIndex(
      { date: 1, status: 1 },
      { unique: true, name: 'date_1_status_1' }
    );
    const failures = await verifyCriticalIndexes(mongoose.connection.db);
    assert.ok(failures.some((failure) => (
      failure.collection === 'appointments' &&
      failure.option === 'unique'
    )));
  }
  finally {
    await Appointment.collection.dropIndex('date_1_status_1');
    await Appointment.createIndexes();
  }
  assert.deepEqual(await verifyCriticalIndexes(mongoose.connection.db), []);

  await Appointment.collection.createIndex(
    { internalNote: 1 },
    { unique: true, name: 'unexpected_unique_internal_note' }
  );
  try {
    const failures = await verifyCriticalIndexes(mongoose.connection.db);
    assert.ok(failures.some((failure) => (
      failure.collection === 'appointments' &&
      failure.issue === 'unexpected_unique_index'
    )));
  }
  finally {
    await Appointment.collection.dropIndex('unexpected_unique_internal_note');
  }

  await Appointment.collection.createIndex(
    { updatedAt: 1 },
    { expireAfterSeconds: 60, name: 'unexpected_ttl_updated_at' }
  );
  try {
    const failures = await verifyCriticalIndexes(mongoose.connection.db);
    assert.ok(failures.some((failure) => (
      failure.collection === 'appointments' &&
      failure.issue === 'unexpected_ttl_index'
    )));
  }
  finally {
    await Appointment.collection.dropIndex('unexpected_ttl_updated_at');
  }
});


test('every model-declared unique and TTL index is in the critical manifest', () => {
  const dangerous = productionModels.flatMap((Model) => (
    Model.schema.indexes()
      .filter(([, options]) => (
        options.unique === true || options.expireAfterSeconds !== undefined
      ))
      .map(([key, options]) => ({
        collection: Model.collection.collectionName,
        key,
        unique: options.unique,
        expireAfterSeconds: options.expireAfterSeconds,
      }))
  ));

  for (const index of dangerous) {
    const expected = CRITICAL_INDEXES.find((candidate) => (
      candidate.collection === index.collection &&
      JSON.stringify(candidate.key) === JSON.stringify(index.key)
    ));
    assert.ok(
      expected,
      `Missing critical index ${index.collection} ${JSON.stringify(index.key)}`
    );
    assert.equal(Boolean(expected.unique), Boolean(index.unique));
    assert.equal(expected.expireAfterSeconds, index.expireAfterSeconds);
  }
});


test('preflight distinguishes standalone Mongo from transaction-capable topology', async () => {
  const result = await verifyMongoGuarantees(mongoose.connection.db);
  assert.equal(result.ok, false);
  assert.equal(result.topology, 'standalone');
});


test('controlled index creation detects duplicate dirty data before building uniqueness', async () => {
  await User.collection.dropIndex('email_1');
  try {
    await User.collection.insertMany([
      { name: 'Duplicate A', email: 'duplicate@example.test', role: 'admin' },
      { name: 'Duplicate B', email: 'duplicate@example.test', role: 'admin' },
    ]);
    const failures = await findDuplicateUniqueData(mongoose.connection.db);
    assert.ok(failures.some((failure) => (
      failure.collection === 'users' &&
      failure.fields.join(',') === 'email'
    )));
  }
  finally {
    await User.collection.deleteMany({ email: 'duplicate@example.test' });
    await User.createIndexes();
  }
});


test('controlled index creation detects duplicate appointment lock elements', async () => {
  const dentist = new mongoose.Types.ObjectId();
  const first = new mongoose.Types.ObjectId();
  const second = new mongoose.Types.ObjectId();

  await Appointment.collection.dropIndex('unique_dentist_booking_lock');
  try {
    await Appointment.collection.insertMany([
      {
        _id: first,
        dentist,
        lockKeys: ['2026-08-15:600'],
        confirmationCode: `PF-${first}`,
      },
      {
        _id: second,
        dentist,
        lockKeys: ['2026-08-15:600'],
        confirmationCode: `PF-${second}`,
      },
    ]);
    const failures = await findDuplicateUniqueData(mongoose.connection.db);
    assert.ok(failures.some((failure) => (
      failure.collection === 'appointments' &&
      failure.fields.join(',') === 'dentist,lockKeys'
    )));
  }
  finally {
    await Appointment.collection.deleteMany({ _id: { $in: [first, second] } });
    await Appointment.createIndexes();
  }
});


test('data preflight requires exactly one clinic singleton', async () => {
  await Clinic.deleteMany({});
  assert.equal(
    (await verifyDataInvariants()).invalidClinicSingleton,
    1
  );

  await Clinic.create({
    key: 'default',
    clinicName: 'Կլինիկա',
    translations: { hy: { clinicName: 'Կլինիկա' } },
  });
  assert.equal(
    (await verifyDataInvariants()).invalidClinicSingleton,
    0
  );
});


test('preflight rejects timezone, schedule-revision, and appointment timestamp drift', async () => {
  const dentistId = new mongoose.Types.ObjectId();
  const appointmentId = new mongoose.Types.ObjectId();
  const categoryId = new mongoose.Types.ObjectId();
  const serviceId = new mongoose.Types.ObjectId();
  await Clinic.collection.updateOne(
    { key: 'default' },
    {
      $set: { timezone: 'UTC' },
      $unset: { scheduleRevision: '', bookingGuardVersion: '' },
    }
  );
  await Dentist.collection.insertOne({
    _id: dentistId,
    slug: `revision-drift-${dentistId}`,
    scheduleRevision: -1,
    bookingGuardVersion: 0.5,
  });
  await ServiceCategory.collection.insertOne({
    _id: categoryId,
    slug: `guard-category-${categoryId}`,
    isActive: false,
  });
  await Service.collection.insertOne({
    _id: serviceId,
    slug: `guard-service-${serviceId}`,
    category: categoryId,
    isActive: false,
    bookingGuardVersion: -1,
  });
  await Appointment.collection.insertOne({
    _id: appointmentId,
    status: 'cancelled',
    date: '2026-08-16',
    startTime: '10:00',
    endTime: '11:00',
    startAt: new Date('2026-08-16T05:00:00.000Z'),
    endAt: new Date('2026-08-16T07:00:00.000Z'),
    lockKeys: [`released:${appointmentId}`],
    mutationVersion: 0,
    privacyPolicyVersion: 'legacy-unverified',
    confirmationCode: `PF-${appointmentId}`,
  });

  try {
    const invariants = await verifyDataInvariants();
    assert.equal(invariants.invalidClinicTimezone, 1);
    assert.equal(invariants.invalidClinicScheduleRevisionState, 1);
    assert.equal(invariants.invalidDentistScheduleRevisionState, 1);
    assert.equal(invariants.invalidServiceBookingGuardState, 1);
    assert.equal(invariants.invalidCategoryServiceMutationState, 1);
    assert.equal(invariants.invalidAppointmentTimestamps, 1);
  }
  finally {
    await Promise.all([
      Clinic.collection.updateOne(
        { key: 'default' },
        {
          $set: {
            timezone: 'Asia/Yerevan',
            scheduleRevision: 0,
            bookingGuardVersion: 0,
          },
        }
      ),
      Dentist.collection.deleteOne({ _id: dentistId }),
      Service.collection.deleteOne({ _id: serviceId }),
      ServiceCategory.collection.deleteOne({ _id: categoryId }),
      Appointment.collection.deleteOne({ _id: appointmentId }),
    ]);
  }
});


test('data preflight detects over-limit, duplicate, and missing quota state', async () => {
  await Clinic.updateOne(
    { key: 'default' },
    { $set: { 'bookingSettings.maxAppointmentsPerPhonePerDay': 1 } }
  );
  const reservationId = new mongoose.Types.ObjectId();
  await PhoneDailyQuota.collection.insertOne({
    phoneKey: 'a'.repeat(64),
    date: '2026-08-16',
    reservations: [
      { reservationId, reservedAt: new Date() },
      { reservationId, reservedAt: new Date() },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await PhoneDailyQuota.collection.insertOne({
    phoneKey: 'b'.repeat(64),
    date: '2026-08-17',
    keyVersion: 'v1',
    reservations: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const appointmentId = new mongoose.Types.ObjectId();
  await Appointment.collection.insertOne({
    _id: appointmentId,
    status: 'pending',
    date: '2026-08-16',
    lockKeys: ['not-a-booking-lock'],
    confirmationCode: `PF-${appointmentId}`,
  });

  try {
    const invariants = await verifyDataInvariants();
    assert.equal(invariants.invalidQuotaRows, 1);
    assert.equal(invariants.overLimitQuotaRows, 1);
    assert.equal(invariants.duplicateQuotaReservationRows, 1);
    assert.equal(invariants.invalidAppointmentLockShapeRows, 1);
    assert.equal(invariants.missingAppointmentQuotaReferences, 1);
  }
  finally {
    await PhoneDailyQuota.deleteMany({});
    await Appointment.collection.deleteOne({ _id: appointmentId });
  }
});


test('data preflight rejects a multivalued current quota key version', async () => {
  const phoneKey = 'c'.repeat(64);
  await PhoneDailyQuota.collection.insertOne({
    phoneKey,
    date: '2026-08-18',
    keyVersion: ['v1', 'v2'],
    reservations: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  try {
    const invariants = await verifyDataInvariants();
    assert.equal(invariants.quotaKeyVersionMismatchRows, 1);
  }
  finally {
    await PhoneDailyQuota.collection.deleteOne({
      phoneKey,
      date: '2026-08-18',
    });
  }
});


test('data preflight rejects valid-looking but incomplete appointment lock ranges', async () => {
  const appointmentId = new mongoose.Types.ObjectId();
  await Appointment.collection.insertOne({
    _id: appointmentId,
    status: 'pending',
    date: '2026-08-16',
    startTime: '10:00',
    endTime: '11:00',
    bufferMinutes: 0,
    lockKeys: ['2026-08-16:600'],
    quotaReservationId: new mongoose.Types.ObjectId(),
    privacyPolicyVersion: '2026-01',
    confirmationCode: `PF-${appointmentId}`,
  });

  try {
    const invariants = await verifyDataInvariants();
    assert.equal(invariants.invalidAppointmentLockShapeRows, 0);
    assert.equal(invariants.incompleteAppointmentLocks, 1);
    assert.equal(invariants.invalidAppointmentMutationVersions, 1);
  }
  finally {
    await Appointment.collection.deleteOne({ _id: appointmentId });
  }
});


test('quota reservation references are unique and preflight detects legacy duplicate ownership', async () => {
  const reservationId = new mongoose.Types.ObjectId();
  const ids = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
  await Appointment.collection.dropIndex(
    'unique_appointment_quota_reservation'
  );
  try {
    await Appointment.collection.insertMany(ids.map((id, index) => ({
      _id: id,
      status: 'pending',
      date: '2026-08-17',
      startTime: `${10 + index}:00`,
      endTime: `${11 + index}:00`,
      bufferMinutes: 0,
      lockKeys: [`2026-08-17:${600 + index * 60}`],
      quotaReservationId: reservationId,
      privacyPolicyVersion: '2026-01',
      confirmationCode: `PF-${id}`,
    })));
    const invariants = await verifyDataInvariants();
    assert.equal(invariants.duplicateAppointmentQuotaReferences, 1);
  }
  finally {
    await Appointment.collection.deleteMany({ _id: { $in: ids } });
    await Appointment.createIndexes();
  }
});


test('preflight detects active catalog and schedule referential drift', async () => {
  const categoryId = new mongoose.Types.ObjectId();
  const serviceId = new mongoose.Types.ObjectId();
  const dentistId = new mongoose.Types.ObjectId();
  const missingDentistId = new mongoose.Types.ObjectId();
  await ServiceCategory.collection.insertOne({
    _id: categoryId,
    slug: `inactive-${categoryId}`,
    isActive: false,
  });
  await Service.collection.insertOne({
    _id: serviceId,
    slug: `dirty-${serviceId}`,
    category: categoryId,
    isActive: true,
  });
  await Dentist.collection.insertOne({
    _id: dentistId,
    slug: `dirty-${dentistId}`,
    isActive: true,
    bookingEnabled: true,
    services: [new mongoose.Types.ObjectId()],
  });
  await DentistScheduleException.collection.insertOne({
    dentist: missingDentistId,
    date: '2026-08-18',
    isWorking: false,
  });

  try {
    const invariants = await verifyDataInvariants();
    assert.equal(invariants.activeServicesWithInvalidCategory, 1);
    assert.equal(invariants.bookableDentistsWithInvalidServices, 1);
    assert.equal(invariants.orphanDentistScheduleExceptions, 1);
  }
  finally {
    await Promise.all([
      ServiceCategory.collection.deleteOne({ _id: categoryId }),
      Service.collection.deleteOne({ _id: serviceId }),
      Dentist.collection.deleteOne({ _id: dentistId }),
      DentistScheduleException.collection.deleteOne({
        dentist: missingDentistId,
      }),
    ]);
  }
});


test('preflight rejects unsafe legacy public URLs and embedded credentials', async () => {
  const categoryId = new mongoose.Types.ObjectId();
  const serviceId = new mongoose.Types.ObjectId();
  const dentistId = new mongoose.Types.ObjectId();
  await ServiceCategory.collection.insertOne({
    _id: categoryId,
    slug: `unsafe-${categoryId}`,
    imageUrl: 'http://example.test/category.jpg',
  });
  await Service.collection.insertOne({
    _id: serviceId,
    slug: `unsafe-${serviceId}`,
    imageUrl: 'https://user:password@example.test/service.jpg',
  });
  await Dentist.collection.insertOne({
    _id: dentistId,
    slug: `unsafe-${dentistId}`,
    photoUrl: 'data:image/svg+xml,unsafe',
  });
  await Clinic.collection.updateOne(
    { key: 'default' },
    {
      $set: {
        mapUrl: 'file:///etc/passwd',
        socialLinks: {
          instagram: 'https://example.test/not-instagram',
          facebook: 'http://facebook.com/insecure',
          whatsapp: 'https://user:password@wa.me/37400000000',
          telegram: 'javascript:alert(1)',
        },
      },
    }
  );

  try {
    const invariants = await verifyDataInvariants();
    assert.equal(invariants.unsafeStoredPublicUrls, 8);
  }
  finally {
    await Promise.all([
      ServiceCategory.collection.deleteOne({ _id: categoryId }),
      Service.collection.deleteOne({ _id: serviceId }),
      Dentist.collection.deleteOne({ _id: dentistId }),
      Clinic.collection.updateOne(
        { key: 'default' },
        { $unset: { mapUrl: '', socialLinks: '' } }
      ),
    ]);
  }
});


test('legacy appointment privacy is a warning while fabricated current evidence blocks', async () => {
  assert.equal(dataInvariantsPass({
    unverifiedLegacyAppointmentPrivacyVersions: 12,
    missingAppointmentPrivacyVersions: 0,
    invalidAppointmentPrivacyEvidence: 0,
  }), true);
  assert.equal(dataInvariantsPass({
    unverifiedLegacyAppointmentPrivacyVersions: 0,
    invalidAppointmentPrivacyEvidence: 1,
  }), false);

  const activeId = new mongoose.Types.ObjectId();
  const cancelledId = new mongoose.Types.ObjectId();
  await Appointment.collection.insertMany([
    {
      _id: activeId,
      status: 'pending',
      date: '2026-08-19',
      startTime: '10:00',
      endTime: '11:00',
      bufferMinutes: 0,
      lockKeys: Array.from(
        { length: 60 },
        (_, offset) => `2026-08-19:${600 + offset}`
      ),
      quotaReservationId: new mongoose.Types.ObjectId(),
      privacyPolicyVersion: '2026-01',
      confirmationCode: `PF-${activeId}`,
    },
    {
      _id: cancelledId,
      status: 'cancelled',
      date: '2026-08-19',
      startTime: '12:00',
      endTime: '13:00',
      bufferMinutes: 0,
      lockKeys: ['2026-08-19:720'],
      privacyPolicyVersion: 'legacy-unverified',
      confirmationCode: `PF-${cancelledId}`,
    },
  ]);

  try {
    const invariants = await verifyDataInvariants();
    assert.equal(invariants.invalidAppointmentPrivacyEvidence, 1);
    assert.equal(invariants.invalidCancelledAppointmentLocks, 1);
    assert.equal(
      invariants.unverifiedLegacyAppointmentPrivacyVersions,
      1
    );
  }
  finally {
    await Appointment.collection.deleteMany({
      _id: { $in: [activeId, cancelledId] },
    });
  }
});


test('published before-after cases require complete verified consent evidence', async () => {
  const caseId = new mongoose.Types.ObjectId();
  await BeforeAfterCase.collection.insertOne({
    _id: caseId,
    publicationStatus: 'published',
    isActive: true,
    consentStatus: 'active',
    consentPolicyVersion: '2026-01',
    beforeImage: { publicId: 'before', secureUrl: 'https://example.test/b' },
    afterImage: { publicId: 'after', secureUrl: 'https://example.test/a' },
  });

  try {
    const invariants = await verifyDataInvariants();
    assert.equal(invariants.invalidConsentCases, 1);
  }
  finally {
    await BeforeAfterCase.collection.deleteOne({ _id: caseId });
  }
});


test('active-admin preflight counts only accounts with usable bcrypt hashes', async () => {
  const baseline = await countUsableActiveAdmins();
  const valid = await User.create({
    name: 'Usable Admin',
    email: 'usable-preflight-admin@example.test',
    password: '123456',
    role: 'admin',
    isActive: true,
    isSetupComplete: true,
  });
  const invalidId = new mongoose.Types.ObjectId();
  await User.collection.insertOne({
    _id: invalidId,
    name: 'Broken Admin',
    email: 'broken-preflight-admin@example.test',
    password: 'plaintext-is-not-usable',
    role: 'admin',
    isActive: true,
    isSetupComplete: true,
  });

  try {
    assert.equal(await countUsableActiveAdmins(), baseline + 1);
  }
  finally {
    await User.deleteMany({ _id: { $in: [valid._id, invalidId] } });
  }
});


test('preflight rejects orphan and legacy appointment idempotency state', async () => {
  const appointmentId = new mongoose.Types.ObjectId();
  const orphanRecordId = new mongoose.Types.ObjectId();
  await Appointment.collection.insertOne({
    _id: appointmentId,
    status: 'cancelled',
    lockKeys: [`released:${appointmentId}`],
    privacyPolicyVersion: 'legacy-unverified',
    confirmationCode: `PF-${appointmentId}`,
    idempotencyKeyHash: 'a'.repeat(64),
    idempotencyRequestHash: 'b'.repeat(64),
  });
  await BookingIdempotency.collection.insertOne({
    _id: orphanRecordId,
    keyHash: 'c'.repeat(64),
    requestHash: 'd'.repeat(64),
    requestHashVersion: 'v1',
    appointment: new mongoose.Types.ObjectId(),
    responseSnapshot: { id: 'missing' },
    expiresAt: new Date(Date.now() + 60_000),
  });

  try {
    const invariants = await verifyDataInvariants();
    assert.equal(invariants.legacyAppointmentIdempotencyHashes, 1);
    assert.equal(invariants.invalidBookingIdempotencyRecords, 0);
    assert.equal(invariants.orphanBookingIdempotencyRecords, 1);
  }
  finally {
    await Promise.all([
      Appointment.collection.deleteOne({ _id: appointmentId }),
      BookingIdempotency.collection.deleteOne({ _id: orphanRecordId }),
    ]);
  }
});
