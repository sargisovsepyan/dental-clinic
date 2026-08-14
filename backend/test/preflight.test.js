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
const {
  verifyCriticalIndexes,
  verifyMongoGuarantees,
  verifyDataInvariants,
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
  assert.deepEqual(await verifyCriticalIndexes(mongoose.connection.db), []);
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
  const appointmentId = new mongoose.Types.ObjectId();
  await Appointment.collection.insertOne({
    _id: appointmentId,
    status: 'pending',
    lockKeys: ['2026-08-16:600'],
    confirmationCode: `PF-${appointmentId}`,
  });

  try {
    const invariants = await verifyDataInvariants();
    assert.equal(invariants.overLimitQuotaRows, 1);
    assert.equal(invariants.duplicateQuotaReservationRows, 1);
    assert.equal(invariants.missingAppointmentQuotaReferences, 1);
  }
  finally {
    await PhoneDailyQuota.deleteMany({});
    await Appointment.collection.deleteOne({ _id: appointmentId });
  }
});
