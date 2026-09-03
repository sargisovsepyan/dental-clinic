import test, {
  after,
  before,
  beforeEach,
} from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.MONGO_URI =
  'mongodb://127.0.0.1:27017/dental_clinic_test';
process.env.JWT_SECRET =
  'test-only-secret-that-is-at-least-thirty-two-characters';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.CLINIC_TIMEZONE = 'Asia/Yerevan';

const {
  connectReplTestDatabase: connectTestDatabase,
  clearReplTestDatabase: clearTestDatabase,
  disconnectReplTestDatabase: disconnectTestDatabase,
} = await import('../test-support/replDatabase.js');
const {
  futureDate,
  publicBooking,
  seedCore,
  seedStaff,
} = await import('../test-support/fixtures.js');
const { default: app } = await import('../src/app.js');
const { default: Appointment } = await import(
  '../src/modules/appointments/appointment.model.js'
);
const { default: PhoneDailyQuota } = await import(
  '../src/modules/appointments/phoneDailyQuota.model.js'
);
const { default: PhoneQuotaKeyIdentity } = await import(
  '../src/modules/appointments/phoneQuotaKeyIdentity.model.js'
);
const { default: BookingIdempotency } = await import(
  '../src/modules/appointments/bookingIdempotency.model.js'
);
const { default: AuditLog } = await import(
  '../src/modules/audit/audit.model.js'
);
const { default: Clinic } = await import(
  '../src/modules/clinic/clinic.model.js'
);
const {
  assertPhoneQuotaKeyIdentity,
  getPhoneQuotaKey,
  reconcilePhoneDailyQuotas,
} = await import(
  '../src/modules/appointments/phoneDailyQuota.service.js'
);
const appointmentService = await import(
  '../src/modules/appointments/appointment.service.js'
);
const quotaMigration = await import(
  '../src/migrations/20260814_002_phone_daily_quota.js'
);
const quotaIdentityMigration = await import(
  '../src/migrations/20260814_006_phone_quota_key_identity.js'
);
const bookingIdempotencyMigration = await import(
  '../src/migrations/20260814_008_booking_idempotency_records.js'
);
const { runMigrations } = await import('../src/migrations/runner.js');
const { default: Migration } = await import(
  '../src/modules/migrations/migration.model.js'
);

let core;
let staff;

before(async () => {
  await connectTestDatabase();
  await Promise.all([
    Appointment.init(),
    PhoneDailyQuota.init(),
    BookingIdempotency.init(),
  ]);
});

beforeEach(async () => {
  await clearTestDatabase();
  core = await seedCore();
  staff = await seedStaff();
});

after(disconnectTestDatabase);

const auth = () => ({
  Authorization: `Bearer ${staff.adminToken}`,
});

const adminBooking = ({
  startTime,
  phone,
  date = core.date,
}) => ({
  ...publicBooking(core, startTime, '900'),
  patientPhone: phone,
  date,
  consentMethod: 'phone',
  source: 'phone',
});

const postAdminBooking = (data) => request(app)
  .post('/api/v1/appointments/admin')
  .set(auth())
  .send(data);

const reschedule = (id, data) => request(app)
  .patch(`/api/v1/appointments/${id}/reschedule`)
  .set(auth())
  .send({ expectedMutationVersion: 0, ...data });

const cancel = (id) => request(app)
  .post(`/api/v1/appointments/${id}/cancel`)
  .set(auth())
  .send({
    expectedMutationVersion: 0,
    reason: 'Quota lifecycle test',
  });

const setLimit = (limit) => Clinic.updateOne(
  { key: 'default' },
  {
    $set: {
      'bookingSettings.maxAppointmentsPerPhonePerDay':
        limit,
    },
  }
);

const getQuota = (phone, date) => PhoneDailyQuota
  .findOne({
    phoneKey: getPhoneQuotaKey(phone),
    date,
  })
  .select('+phoneKey')
  .lean();

test('MongoDB has the unique phone/day quota index', async () => {
  const indexes =
    await PhoneDailyQuota.collection.indexes();
  const quotaIndex = indexes.find(
    ({ name }) => name === 'unique_phone_daily_quota'
  );

  assert.deepEqual(
    quotaIndex.key,
    { phoneKey: 1, date: 1 }
  );
  assert.equal(quotaIndex.unique, true);
});


test('appointment creation rolls quota back atomically when insertion fails', async () => {
  const originalCreate = Appointment.create;
  Appointment.create = async () => {
    throw new Error('simulated appointment insert failure');
  };

  try {
    await assert.rejects(
      appointmentService.createAppointment(
        publicBooking(core, '09:00', '990')
      ),
      /simulated appointment insert failure/
    );
  }
  finally {
    Appointment.create = originalCreate;
  }

  assert.equal(await Appointment.countDocuments(), 0);
  assert.equal(await PhoneDailyQuota.countDocuments(), 0);
});


test('public booking idempotency replays one durable side effect and rejects key reuse', async () => {
  const key = '123e4567-e89b-42d3-a456-426614174000';
  const payload = publicBooking(core, '09:00', '989');
  const responses = await Promise.all([
    request(app)
      .post('/api/v1/appointments')
      .set('Idempotency-Key', key)
      .send(payload),
    request(app)
      .post('/api/v1/appointments')
      .set('Idempotency-Key', key)
      .send(payload),
  ]);

  assert.deepEqual(responses.map(({ status }) => status), [201, 201]);
  assert.equal(
    responses[0].body.data.appointment.confirmationCode,
    responses[1].body.data.appointment.confirmationCode
  );
  assert.equal(await Appointment.countDocuments(), 1);
  assert.equal(await BookingIdempotency.countDocuments(), 1);
  assert.equal(
    await AuditLog.countDocuments({ action: 'appointment.create.website' }),
    1
  );
  assert.equal(
    await AuditLog.countDocuments({ action: 'appointment.booking.replay' }),
    1
  );

  await PhoneQuotaKeyIdentity.collection.updateOne(
    { _id: 'phone-quota-key-identity' },
    { $set: { keyVersion: 'v2' } }
  );
  const replayAcrossQuotaRotation = await request(app)
    .post('/api/v1/appointments')
    .set('Idempotency-Key', key)
    .send(payload);
  assert.equal(replayAcrossQuotaRotation.status, 201);
  assert.equal(
    replayAcrossQuotaRotation.body.data.appointment.confirmationCode,
    responses[0].body.data.appointment.confirmationCode
  );
  assert.equal(await PhoneDailyQuota.countDocuments(), 1);

  const mismatch = await request(app)
    .post('/api/v1/appointments')
    .set('Idempotency-Key', key)
    .send({ ...payload, startTime: '10:00' });
  assert.equal(mismatch.status, 409);
  assert.equal(await Appointment.countDocuments(), 1);
});


test('booking idempotency TTL expiry permits a new side effect without deleting the old appointment', async () => {
  const key = '223e4567-e89b-42d3-a456-426614174000';
  const payload = publicBooking(core, '09:00', '988');
  const first = await request(app)
    .post('/api/v1/appointments')
    .set('Idempotency-Key', key)
    .send(payload);
  assert.equal(first.status, 201);

  await appointmentService.cancelAppointment(
    first.body.data.appointment.id,
    staff.admin._id,
    'Expire idempotency test'
  );
  await BookingIdempotency.collection.updateOne(
    {},
    { $set: { expiresAt: new Date(0) } }
  );

  const second = await request(app)
    .post('/api/v1/appointments')
    .set('Idempotency-Key', key)
    .send(payload);
  assert.equal(second.status, 201);
  assert.notEqual(
    second.body.data.appointment.confirmationCode,
    first.body.data.appointment.confirmationCode
  );
  assert.equal(await Appointment.countDocuments(), 2);
  assert.equal(await BookingIdempotency.countDocuments(), 1);
});


test('idempotent replay returns the original successful snapshot after later mutation', async () => {
  const key = '323e4567-e89b-42d3-a456-426614174000';
  const payload = publicBooking(core, '09:00', '987');
  const first = await request(app)
    .post('/api/v1/appointments')
    .set('Idempotency-Key', key)
    .send(payload);
  assert.equal(first.status, 201);
  await appointmentService.cancelAppointment(
    first.body.data.appointment.id,
    staff.admin._id,
    'Replay snapshot test'
  );

  const replay = await request(app)
    .post('/api/v1/appointments')
    .set('Idempotency-Key', key)
    .send(payload);
  assert.equal(replay.status, 201);
  assert.deepEqual(replay.body, first.body);
});


test('booking idempotency indexes are unique and TTL-backed', async () => {
  const indexes = await BookingIdempotency.collection.indexes();
  const keyIndex = indexes.find(({ key }) => key.keyHash === 1);
  const ttlIndex = indexes.find(({ key }) => key.expiresAt === 1);
  assert.equal(keyIndex.unique, true);
  assert.equal(ttlIndex.expireAfterSeconds, 0);
});


test('quota key identity mismatch fails closed without creating another namespace', async () => {
  const first = await postAdminBooking(
    adminBooking({ startTime: '09:00', phone: '+37499123991' })
  );
  assert.equal(first.status, 201);
  await PhoneQuotaKeyIdentity.collection.updateOne(
    { _id: 'phone-quota-key-identity' },
    { $set: { keyVersion: 'v2' } }
  );

  const blocked = await postAdminBooking(
    adminBooking({ startTime: '10:00', phone: '+37499123991' })
  );
  assert.equal(blocked.status, 503);
  assert.equal(await Appointment.countDocuments(), 1);
  assert.equal(await PhoneDailyQuota.countDocuments(), 1);
});


test('cancellation releases its original lock and quota despite quota key identity mismatch', async () => {
  const created = await postAdminBooking(
    adminBooking({ startTime: '09:00', phone: '+37499123996' })
  );
  assert.equal(created.status, 201);
  const appointmentId = created.body.data.appointment._id;

  await PhoneQuotaKeyIdentity.collection.updateOne(
    { _id: 'phone-quota-key-identity' },
    { $set: { keyVersion: 'v2' } }
  );

  await appointmentService.cancelAppointment(
    appointmentId,
    staff.admin._id,
    'Release during key rotation incident'
  );

  const cancelled = await Appointment.findById(appointmentId)
    .select('+lockKeys +quotaReservationId')
    .lean();
  assert.equal(cancelled.status, 'cancelled');
  assert.deepEqual(cancelled.lockKeys, [`released:${appointmentId}`]);
  assert.equal(
    await PhoneDailyQuota.countDocuments({
      'reservations.reservationId': cancelled.quotaReservationId,
    }),
    0
  );

  await PhoneQuotaKeyIdentity.collection.updateOne(
    { _id: 'phone-quota-key-identity' },
    { $set: { keyVersion: 'v1' } }
  );
  const replacement = await postAdminBooking(
    adminBooking({ startTime: '09:00', phone: '+37499123997' })
  );
  assert.equal(replacement.status, 201);
});


test('runtime cannot auto-bless legacy quota rows when key identity is missing', async () => {
  await PhoneDailyQuota.collection.insertOne({
    phoneKey: getPhoneQuotaKey('+37499123995'),
    date: core.date,
    reservations: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await assert.rejects(
    appointmentService.createAppointment(
      publicBooking(core, '09:00', '995')
    ),
    (error) => (
      error.statusCode === 503 &&
      /no attested key identity/.test(error.message)
    )
  );
  assert.equal(await PhoneQuotaKeyIdentity.countDocuments(), 0);
  assert.equal(await Appointment.countDocuments(), 0);
});


test('reconciliation reports stale orphans but never deletes quota capacity automatically', async () => {
  const created = await postAdminBooking(
    adminBooking({ startTime: '09:00', phone: '+37499123992' })
  );
  assert.equal(created.status, 201);

  const orphanId = new mongoose.Types.ObjectId();
  await PhoneDailyQuota.create({
    phoneKey: getPhoneQuotaKey('+37499123993'),
    keyVersion: 'v1',
    date: core.date,
    reservations: [{
      reservationId: orphanId,
      reservedAt: new Date(0),
    }],
  });

  const result = await reconcilePhoneDailyQuotas({
    dryRun: false,
    staleAfterMinutes: 0,
  });
  assert.equal(result.orphanReservations, 1);
  assert.ok(await PhoneDailyQuota.exists({
    'reservations.reservationId': orphanId,
  }));
});


test('preflight reconciliation counts live orphan capacity without deleting it', async () => {
  const orphanId = new mongoose.Types.ObjectId();
  await PhoneDailyQuota.create({
    phoneKey: getPhoneQuotaKey('+37499123996'),
    keyVersion: 'v1',
    date: core.date,
    reservations: [{
      reservationId: orphanId,
      reservedAt: new Date(Date.now() + 60_000),
    }],
  });

  const ordinary = await reconcilePhoneDailyQuotas({
    dryRun: true,
    staleAfterMinutes: 0,
  });
  const preflight = await reconcilePhoneDailyQuotas({
    dryRun: true,
    includeLiveOrphans: true,
  });
  assert.equal(ordinary.orphanReservations, 0);
  assert.equal(preflight.orphanReservations, 1);
  assert.ok(await PhoneDailyQuota.exists({
    'reservations.reservationId': orphanId,
  }));
});

test('many concurrent HTTP bookings cannot exceed the phone/day limit', async () => {
  await setLimit(3);
  const phone = '+37499123000';
  const times = [
    '09:00',
    '10:00',
    '11:00',
    '12:00',
    '13:00',
    '14:00',
    '15:00',
    '16:00',
    '17:00',
  ];

  const responses = await Promise.all(
    times.map((startTime) => postAdminBooking(
      adminBooking({ startTime, phone })
    ))
  );

  assert.equal(
    responses.filter(({ status }) => status === 201)
      .length,
    3
  );
  assert.equal(
    responses.filter(({ status }) => status === 429)
      .length,
    times.length - 3
  );
  assert.equal(
    await Appointment.countDocuments({
      patientPhone: phone,
      date: core.date,
      status: { $ne: 'cancelled' },
    }),
    3
  );
  assert.equal(
    (await getQuota(phone, core.date)).reservations
      .length,
    3
  );
});

test('a slot-conflict loser releases its independent quota reservation', async () => {
  await setLimit(1);
  const phones = [
    '+37499123001',
    '+37499123002',
  ];
  const responses = await Promise.all(
    phones.map((phone) => postAdminBooking(
      adminBooking({ startTime: '09:00', phone })
    ))
  );

  assert.deepEqual(
    responses.map(({ status }) => status).sort(),
    [201, 409]
  );

  const loserIndex = responses.findIndex(
    ({ status }) => status === 409
  );
  const loserPhone = phones[loserIndex];
  assert.equal(
    await getQuota(loserPhone, core.date),
    null
  );

  const retry = await postAdminBooking(
    adminBooking({
      startTime: '11:00',
      phone: loserPhone,
    })
  );
  assert.equal(retry.status, 201);
});

test('different phones receive independent daily quota capacity', async () => {
  await setLimit(1);
  const responses = await Promise.all([
    postAdminBooking(adminBooking({
      startTime: '09:00',
      phone: '+37499123011',
    })),
    postAdminBooking(adminBooking({
      startTime: '11:00',
      phone: '+37499123012',
    })),
  ]);

  assert.deepEqual(
    responses.map(({ status }) => status),
    [201, 201]
  );
  assert.equal(await PhoneDailyQuota.countDocuments(), 2);
});

test('cross-day reschedule moves quota while same-day reschedule keeps one reservation', async () => {
  await setLimit(1);
  const phone = '+37499123003';
  const targetDate = futureDate(15);
  const created = await postAdminBooking(
    adminBooking({ startTime: '09:00', phone })
  );
  const id = created.body.data.appointment._id;

  const sameDay = await reschedule(id, {
    date: core.date,
    startTime: '10:00',
  });
  assert.equal(sameDay.status, 200);
  const migratedQuota = await getQuota(phone, core.date);
  assert.equal(migratedQuota.reservations.length, 1);
  assert.equal(migratedQuota.keyVersion, 'v1');

  const moved = await reschedule(id, {
    expectedMutationVersion: 1,
    date: targetDate,
    startTime: '09:00',
  });
  assert.equal(moved.status, 200);
  assert.equal(await getQuota(phone, core.date), null);
  assert.equal(
    (await getQuota(phone, targetDate)).reservations
      .length,
    1
  );

  assert.equal(
    (await postAdminBooking(adminBooking({
      startTime: '12:00',
      phone,
    }))).status,
    201
  );
  assert.equal(
    (await postAdminBooking(adminBooking({
      startTime: '11:00',
      phone,
      date: targetDate,
    }))).status,
    429
  );
});

test('full target day rejects reschedule and preserves the original reservation', async () => {
  await setLimit(1);
  const phone = '+37499123004';
  const targetDate = futureDate(15);
  const original = await postAdminBooking(
    adminBooking({ startTime: '09:00', phone })
  );
  const blocker = await postAdminBooking(
    adminBooking({
      startTime: '09:00',
      phone,
      date: targetDate,
    })
  );

  const rejected = await reschedule(
    original.body.data.appointment._id,
    {
      date: targetDate,
      startTime: '11:00',
    }
  );
  assert.equal(rejected.status, 429);

  const stored = await Appointment.findById(
    original.body.data.appointment._id
  ).lean();
  assert.equal(stored.date, core.date);
  assert.equal(
    (await getQuota(phone, core.date)).reservations
      .length,
    1
  );
  assert.equal(
    (await getQuota(phone, targetDate)).reservations
      .length,
    1
  );

  assert.equal(
    (await cancel(blocker.body.data.appointment._id))
      .status,
    200
  );
  assert.equal(
    (await reschedule(
      original.body.data.appointment._id,
      { date: targetDate, startTime: '11:00' }
    )).status,
    200
  );
});

test('same-phone booking versus cross-day reschedule has one target-day quota winner', async () => {
  await setLimit(1);
  const phone = '+37499123013';
  const targetDate = futureDate(15);
  const original = await postAdminBooking(
    adminBooking({ startTime: '09:00', phone })
  );
  const id = original.body.data.appointment._id;

  const responses = await Promise.all([
    postAdminBooking(adminBooking({
      startTime: '09:00',
      phone,
      date: targetDate,
    })),
    reschedule(id, {
      date: targetDate,
      startTime: '11:00',
    }),
  ]);

  assert.equal(
    responses.filter(({ status }) =>
      status === 200 || status === 201
    ).length,
    1
  );
  assert.equal(
    responses.filter(({ status }) => status === 429)
      .length,
    1
  );
  assert.equal(
    await Appointment.countDocuments({
      patientPhone: phone,
      date: targetDate,
      status: { $ne: 'cancelled' },
    }),
    1
  );
  assert.equal(
    (await getQuota(phone, targetDate)).reservations
      .length,
    1
  );

  const storedOriginal = await Appointment.findById(id)
    .lean();
  assert.equal(
    storedOriginal.date === core.date ||
      storedOriginal.date === targetDate,
    true
  );
});

test('concurrent cancellation and booking never produce an over-limit day', async () => {
  await setLimit(1);
  const phone = '+37499123005';
  const created = await postAdminBooking(
    adminBooking({ startTime: '09:00', phone })
  );

  const [cancellation, booking] = await Promise.all([
    cancel(created.body.data.appointment._id),
    postAdminBooking(adminBooking({
      startTime: '11:00',
      phone,
    })),
  ]);

  assert.equal(cancellation.status, 200);
  assert.ok([201, 429].includes(booking.status));
  assert.ok(
    await Appointment.countDocuments({
      patientPhone: phone,
      date: core.date,
      status: { $ne: 'cancelled' },
    }) <= 1
  );

  if (booking.status === 429) {
    assert.equal(
      (await postAdminBooking(adminBooking({
        startTime: '11:00',
        phone,
      }))).status,
      201
    );
  }

  assert.equal(
    (await getQuota(phone, core.date)).reservations
      .length,
    1
  );
});

test('competing cross-day reschedules leave quota only on the CAS winner', async () => {
  await setLimit(1);
  const phone = '+37499123006';
  const targets = [futureDate(15), futureDate(16)];
  const created = await postAdminBooking(
    adminBooking({ startTime: '09:00', phone })
  );
  const id = created.body.data.appointment._id;

  const responses = await Promise.all(
    targets.map((date) => reschedule(id, {
      date,
      startTime: '09:00',
    }))
  );
  assert.deepEqual(
    responses.map(({ status }) => status).sort(),
    [200, 409]
  );

  const stored = await Appointment.findById(id).lean();
  const quotas = await PhoneDailyQuota.find().lean();
  assert.ok(targets.includes(stored.date));
  assert.equal(
    quotas.reduce(
      (sum, quota) => sum + quota.reservations.length,
      0
    ),
    1
  );
  assert.equal(quotas[0].date, stored.date);
});

test('quota migration and reconciliation are dry-run safe and idempotent', async () => {
  const phone = '+37499123007';
  const created = await postAdminBooking(
    adminBooking({ startTime: '09:00', phone })
  );
  const id = new mongoose.Types.ObjectId(
    created.body.data.appointment._id
  );

  await PhoneDailyQuota.deleteMany({});
  await Appointment.collection.updateOne(
    { _id: id },
    { $unset: { quotaReservationId: '' } }
  );

  const dryRun = await quotaMigration.run({
    dryRun: true,
  });
  assert.equal(dryRun.appointmentIdsBackfilled, 1);
  assert.equal(await PhoneDailyQuota.countDocuments(), 0);

  await quotaMigration.run({ dryRun: false });
  await quotaMigration.run({ dryRun: false });
  const migrated = await Appointment.findById(id)
    .select('+quotaReservationId')
    .lean();
  assert.equal(
    String(migrated.quotaReservationId),
    String(id)
  );
  assert.equal(
    (await getQuota(phone, core.date)).reservations
      .length,
    1
  );

  await PhoneDailyQuota.deleteMany({});
  const reconcileDryRun =
    await reconcilePhoneDailyQuotas({
      dryRun: true,
      staleAfterMinutes: 0,
    });
  assert.equal(reconcileDryRun.missingReservations, 1);
  assert.equal(await PhoneDailyQuota.countDocuments(), 0);

  await reconcilePhoneDailyQuotas({
    dryRun: false,
    staleAfterMinutes: 0,
  });
  await reconcilePhoneDailyQuotas({
    dryRun: false,
    staleAfterMinutes: 0,
  });
  assert.equal(
    (await getQuota(phone, core.date)).reservations
      .length,
    1
  );
});

test('quota migration cannot recreate capacity after a concurrent cancellation', async () => {
  const phone = '+37499123008';
  const created = await postAdminBooking(
    adminBooking({ startTime: '09:00', phone })
  );
  const id = new mongoose.Types.ObjectId(
    created.body.data.appointment._id
  );
  await PhoneDailyQuota.deleteMany({});
  await Appointment.collection.updateOne(
    { _id: id },
    { $unset: { quotaReservationId: '' } }
  );
  let cancelled = false;

  const result = await quotaMigration.run({
    dryRun: false,
    beforeReservationWrite: async (appointment) => {
      if (cancelled || String(appointment._id) !== String(id)) return;
      cancelled = true;
      await Appointment.collection.updateOne(
        { _id: id },
        {
          $set: {
            status: 'cancelled',
            lockKeys: [`released:${id}`],
            updatedAt: new Date(),
          },
        }
      );
    },
  });

  assert.equal(result.reservationsProcessed, 0);
  assert.equal((await Appointment.findById(id).lean()).status, 'cancelled');
  assert.equal(await PhoneDailyQuota.countDocuments(), 0);
});


test('quota migration fails before mutating rows owned by another key version', async () => {
  const phone = '+37499123018';
  const created = await postAdminBooking(
    adminBooking({ startTime: '09:00', phone })
  );
  const id = new mongoose.Types.ObjectId(
    created.body.data.appointment._id
  );
  await PhoneDailyQuota.deleteMany({});
  await Appointment.collection.updateOne(
    { _id: id },
    { $unset: { quotaReservationId: '' } }
  );
  const foreignReservationId = new mongoose.Types.ObjectId();
  await PhoneDailyQuota.collection.insertOne({
    phoneKey: getPhoneQuotaKey(phone),
    date: core.date,
    keyVersion: 'v2',
    reservations: [{
      reservationId: foreignReservationId,
      reservedAt: new Date(),
    }],
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await assert.rejects(
    quotaMigration.run({ dryRun: false }),
    /non-current keyVersion/
  );

  const preservedAppointment = await Appointment.collection.findOne({ _id: id });
  const preservedQuota = await PhoneDailyQuota.collection.findOne({
    phoneKey: getPhoneQuotaKey(phone),
    date: core.date,
  });
  assert.equal(preservedAppointment.quotaReservationId, undefined);
  assert.equal(preservedQuota.keyVersion, 'v2');
  assert.deepEqual(
    preservedQuota.reservations.map(({ reservationId }) => String(reservationId)),
    [String(foreignReservationId)]
  );
});


test('quota migrations reject multivalued key versions before any mutation', async () => {
  const id = new mongoose.Types.ObjectId();
  const phone = '+37499123068';
  await Appointment.collection.insertOne({
    _id: id,
    patientName: 'Malformed Quota Version Patient',
    patientPhone: phone,
    status: 'pending',
    date: core.date,
    startTime: '09:00',
    endTime: '10:00',
    bufferMinutes: 0,
    lockKeys: Array.from(
      { length: 60 },
      (_, offset) => `${core.date}:${540 + offset}`
    ),
    confirmationCode: `LEGACY-${id}`,
  });
  await PhoneDailyQuota.collection.insertOne({
    phoneKey: getPhoneQuotaKey(phone),
    date: core.date,
    keyVersion: ['v1', 'v2'],
    reservations: [],
  });

  await assert.rejects(
    quotaMigration.run({
      dryRun: false,
      quotaKeyAttestation: 'v1',
    }),
    /malformed keyVersion/
  );
  await assert.rejects(
    quotaIdentityMigration.run({
      dryRun: false,
      quotaKeyAttestation: 'v1',
    }),
    /another key version/
  );

  const preservedAppointment = await Appointment.collection.findOne({ _id: id });
  const preservedQuota = await PhoneDailyQuota.collection.findOne({
    phoneKey: getPhoneQuotaKey(phone),
    date: core.date,
  });
  assert.equal(preservedAppointment.quotaReservationId, undefined);
  assert.deepEqual(preservedQuota.keyVersion, ['v1', 'v2']);
  assert.equal(await PhoneQuotaKeyIdentity.countDocuments(), 0);
});


test('runtime quota admission rejects a multivalued current key version', async () => {
  const phone = '+37499123078';
  await assertPhoneQuotaKeyIdentity();
  await PhoneDailyQuota.collection.insertOne({
    phoneKey: getPhoneQuotaKey(phone),
    date: core.date,
    keyVersion: ['v1', 'v2'],
    reservations: [],
  });

  const response = await postAdminBooking(
    adminBooking({ startTime: '09:00', phone })
  );

  assert.equal(response.status, 503);
  assert.equal(await Appointment.countDocuments({ patientPhone: phone }), 0);
  assert.deepEqual(
    (await PhoneDailyQuota.collection.findOne({
      phoneKey: getPhoneQuotaKey(phone),
      date: core.date,
    })).reservations,
    []
  );
});


test('quota backfill establishes identity before hashing and flows into migration 006', async () => {
  const id = new mongoose.Types.ObjectId();
  await Appointment.collection.insertOne({
    _id: id,
    patientName: 'Legacy Quota Patient',
    patientPhone: '+37499123028',
    status: 'pending',
    date: core.date,
    startTime: '09:00',
    endTime: '10:00',
    bufferMinutes: 0,
    lockKeys: Array.from(
      { length: 60 },
      (_, offset) => `${core.date}:${540 + offset}`
    ),
    confirmationCode: `LEGACY-${id}`,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const preview = await quotaMigration.run({ dryRun: true });
  assert.equal(preview.quotaRowCount, 0);
  assert.equal(preview.requiresKeyIdentityAttestation, false);
  assert.equal(await PhoneQuotaKeyIdentity.countDocuments(), 0);

  const backfill = await quotaMigration.run({ dryRun: false });
  assert.equal(backfill.identityCreated, true);
  assert.equal(backfill.reservationsProcessed, 1);
  assert.equal(await PhoneQuotaKeyIdentity.countDocuments(), 1);
  const quota = await PhoneDailyQuota.findOne({ date: core.date }).lean();
  assert.equal(quota.keyVersion, 'v1');

  const identityMigration = await quotaIdentityMigration.run({ dryRun: false });
  assert.equal(identityMigration.requiresKeyIdentityAttestation, false);
  assert.equal(identityMigration.keyIdentityAttestationAccepted, false);
  assert.equal(identityMigration.identityCreated, false);
});


test('quota backfill accepts attested null-version rows through migration 006', async () => {
  const id = new mongoose.Types.ObjectId();
  const legacyReservation = new mongoose.Types.ObjectId();
  const phone = '+37499123048';
  await Appointment.collection.insertOne({
    _id: id,
    patientName: 'Null Version Patient',
    patientPhone: phone,
    status: 'pending',
    date: core.date,
    startTime: '09:00',
    endTime: '10:00',
    bufferMinutes: 0,
    lockKeys: Array.from(
      { length: 60 },
      (_, offset) => `${core.date}:${540 + offset}`
    ),
    confirmationCode: `LEGACY-${id}`,
  });
  await PhoneDailyQuota.collection.insertOne({
    phoneKey: getPhoneQuotaKey(phone),
    date: core.date,
    keyVersion: null,
    reservations: [{
      reservationId: legacyReservation,
      reservedAt: new Date(),
    }],
  });

  const backfill = await quotaMigration.run({
    dryRun: false,
    quotaKeyAttestation: 'v1',
  });
  assert.equal(backfill.requiresKeyIdentityAttestation, true);
  assert.equal(backfill.keyIdentityAttestationAccepted, true);
  assert.equal(backfill.reservationsProcessed, 1);
  const identityMigration = await quotaIdentityMigration.run({
    dryRun: false,
    quotaKeyAttestation: 'v1',
  });
  assert.equal(identityMigration.requiresKeyIdentityAttestation, true);
  assert.equal(identityMigration.keyIdentityAttestationAccepted, true);
  assert.equal(
    (await PhoneDailyQuota.findOne({ date: core.date }).lean()).keyVersion,
    'v1'
  );
});


test('quota backfill records failure without mutating duplicate phone/day owners', async () => {
  const id = new mongoose.Types.ObjectId();
  const phone = '+37499123058';
  const phoneKey = getPhoneQuotaKey(phone);
  await PhoneDailyQuota.collection.dropIndex('unique_phone_daily_quota');
  try {
    await Appointment.collection.insertOne({
      _id: id,
      patientName: 'Duplicate Quota Patient',
      patientPhone: phone,
      status: 'pending',
      date: core.date,
      startTime: '09:00',
      endTime: '10:00',
      bufferMinutes: 0,
      lockKeys: Array.from(
        { length: 60 },
        (_, offset) => `${core.date}:${540 + offset}`
      ),
      confirmationCode: `LEGACY-${id}`,
    });
    await PhoneDailyQuota.collection.insertMany([1, 2].map((suffix) => ({
      phoneKey,
      date: core.date,
      reservations: [{
        reservationId: new mongoose.Types.ObjectId(),
        reservedAt: new Date(suffix),
      }],
    })));
    const candidate = {
      ...quotaMigration,
      version: 'test_duplicate_quota_002',
    };

    await assert.rejects(
      runMigrations({
        dryRun: false,
        migrationSet: [candidate],
        quotaKeyAttestation: 'v1',
      }),
      /duplicate phone\/day rows/
    );

    const appointment = await Appointment.collection.findOne({ _id: id });
    const ledger = await Migration.collection.findOne({
      version: candidate.version,
    });
    assert.equal(appointment.quotaReservationId, undefined);
    assert.equal(await PhoneDailyQuota.countDocuments({ phoneKey }), 2);
    assert.equal(await PhoneQuotaKeyIdentity.countDocuments(), 0);
    assert.equal(ledger.state, 'failed');
    assert.equal(ledger.appliedAt, undefined);
  }
  finally {
    await PhoneDailyQuota.deleteMany({ phoneKey });
    await PhoneDailyQuota.createIndexes();
  }
});


test('quota backfill rejects mismatched persisted identity before mutation', async () => {
  const id = new mongoose.Types.ObjectId();
  await assertPhoneQuotaKeyIdentity();
  await PhoneQuotaKeyIdentity.collection.updateOne(
    { _id: 'phone-quota-key-identity' },
    { $set: { keyVersion: 'v2' } }
  );
  await Appointment.collection.insertOne({
    _id: id,
    patientName: 'Mismatched Identity Patient',
    patientPhone: '+37499123038',
    status: 'pending',
    date: core.date,
    startTime: '09:00',
    endTime: '10:00',
    bufferMinutes: 0,
    lockKeys: Array.from(
      { length: 60 },
      (_, offset) => `${core.date}:${540 + offset}`
    ),
    confirmationCode: `LEGACY-${id}`,
  });

  await assert.rejects(
    quotaMigration.run({ dryRun: false }),
    /identity does not match/
  );
  assert.equal(await PhoneDailyQuota.countDocuments(), 0);
  assert.equal(
    (await Appointment.collection.findOne({ _id: id })).quotaReservationId,
    undefined
  );
});


test('quota identity migration quarantines legacy consent without inventing current acceptance', async () => {
  const appointmentId = new mongoose.Types.ObjectId();
  const reservationId = new mongoose.Types.ObjectId();
  await Appointment.collection.insertOne({
    _id: appointmentId,
    patientName: 'Legacy Patient',
    patientPhone: '+37499123994',
    status: 'pending',
    date: core.date,
    startTime: '09:00',
    endTime: '10:00',
    bufferMinutes: 0,
    lockKeys: Array.from(
      { length: 60 },
      (_, offset) => `${core.date}:${540 + offset}`
    ),
    quotaReservationId: reservationId,
    confirmationCode: `LEGACY-${appointmentId}`,
  });
  await PhoneDailyQuota.collection.insertOne({
    phoneKey: getPhoneQuotaKey('+37499123994'),
    date: core.date,
    reservations: [{ reservationId, reservedAt: new Date() }],
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const dryRun = await quotaIdentityMigration.run({ dryRun: true });
  assert.equal(dryRun.quotaRowsMissingVersion, 1);
  assert.equal(dryRun.appointmentsMissingMutationVersion, 1);
  assert.equal(dryRun.appointmentsWithUnversionedPrivacyConsent, 1);
  assert.equal(dryRun.requiresKeyIdentityAttestation, true);
  assert.equal(dryRun.keyIdentityAttestationAccepted, false);
  assert.equal(await PhoneQuotaKeyIdentity.countDocuments(), 0);

  await assert.rejects(
    quotaIdentityMigration.run({ dryRun: false }),
    /attest-phone-quota-key-version=v1/
  );
  const stillLegacy = await Appointment.collection.findOne({
    _id: appointmentId,
  });
  assert.equal(stillLegacy.privacyPolicyVersion, undefined);
  assert.equal(await PhoneQuotaKeyIdentity.countDocuments(), 0);

  await quotaIdentityMigration.run({
    dryRun: false,
    quotaKeyAttestation: 'v1',
  });
  const migrated = await Appointment.findById(appointmentId).lean();
  const quota = await PhoneDailyQuota.findOne({ date: core.date }).lean();
  assert.equal(migrated.mutationVersion, 0);
  assert.equal(migrated.privacyPolicyVersion, 'legacy-unverified');
  assert.notEqual(migrated.privacyPolicyVersion, '2026-01');
  assert.equal(quota.keyVersion, 'v1');
  assert.equal(await PhoneQuotaKeyIdentity.countDocuments(), 1);

  const rerun = await quotaIdentityMigration.run({ dryRun: false });
  assert.equal(rerun.quotaRowsMissingVersion, 0);
  assert.equal(rerun.appointmentsMissingMutationVersion, 0);
  assert.equal(rerun.appointmentsWithUnversionedPrivacyConsent, 0);
  assert.equal(rerun.identityCreated, false);
});


test('legacy appointment idempotency migration is dry-run safe, bounded, and idempotent', async () => {
  const created = await postAdminBooking(
    adminBooking({ startTime: '09:00', phone: '+37499123998' })
  );
  assert.equal(created.status, 201);
  const appointmentId = new mongoose.Types.ObjectId(
    created.body.data.appointment._id
  );
  const keyHash = 'd'.repeat(64);
  const requestHash = 'e'.repeat(64);
  await Appointment.collection.updateOne(
    { _id: appointmentId },
    {
      $set: {
        idempotencyKeyHash: keyHash,
        idempotencyRequestHash: requestHash,
      },
    }
  );

  const dryRun = await bookingIdempotencyMigration.run({ dryRun: true });
  assert.equal(dryRun.appointmentsScanned, 1);
  assert.equal(await BookingIdempotency.countDocuments(), 0);
  assert.equal(
    (await Appointment.collection.findOne({ _id: appointmentId }))
      .idempotencyKeyHash,
    keyHash
  );

  const applied = await bookingIdempotencyMigration.run({ dryRun: false });
  assert.equal(applied.activeRecordsCreated, 1);
  assert.equal(applied.legacyHashesCleared, 1);
  const migratedAppointment = await Appointment.collection.findOne({
    _id: appointmentId,
  });
  assert.equal(migratedAppointment.idempotencyKeyHash, undefined);
  assert.equal(await BookingIdempotency.countDocuments(), 1);
  const migratedRecord = await BookingIdempotency.findOne({ keyHash })
    .select('+responseSnapshot')
    .lean();
  assert.deepEqual(
    Object.keys(migratedRecord.responseSnapshot.dentist).sort(),
    ['firstName', 'id', 'lastName', 'slug', 'title', 'translations']
  );
  assert.equal(migratedRecord.responseSnapshot.dentist._id, undefined);
  assert.equal(
    String(migratedRecord.responseSnapshot.dentist.id),
    String(core.dentist._id)
  );
  assert.deepEqual(
    Object.keys(migratedRecord.responseSnapshot.service).sort(),
    [
      'currency',
      'durationMinutes',
      'id',
      'name',
      'priceFrom',
      'priceTo',
      'priceType',
      'translations',
    ]
  );
  assert.equal(migratedRecord.responseSnapshot.service._id, undefined);
  assert.equal(
    String(migratedRecord.responseSnapshot.service.id),
    String(core.service._id)
  );
  assert.equal(
    (await bookingIdempotencyMigration.run({ dryRun: false }))
      .appointmentsScanned,
    0
  );
});

test('legacy idempotency with unknown age expires without extending patient data retention', async () => {
  const appointmentId = new mongoose.Types.ObjectId();
  const keyHash = '7'.repeat(64);
  await Appointment.collection.insertOne({
    _id: appointmentId,
    patientName: 'Unknown Age Patient',
    status: 'cancelled',
    lockKeys: [`released:${appointmentId}`],
    confirmationCode: `UNKNOWN-${appointmentId}`,
    idempotencyKeyHash: keyHash,
    idempotencyRequestHash: '8'.repeat(64),
  });

  const result = await bookingIdempotencyMigration.run({ dryRun: false });
  assert.equal(result.activeRecordsCreated, 0);
  assert.equal(result.expiredHashesCleared, 1);
  assert.equal(result.legacyHashesCleared, 1);
  assert.equal(await BookingIdempotency.countDocuments({ keyHash }), 0);
  const migrated = await Appointment.collection.findOne({
    _id: appointmentId,
  });
  assert.equal(migrated.idempotencyKeyHash, undefined);
  assert.equal(migrated.idempotencyRequestHash, undefined);
});

test('legacy idempotency migration rolls back when source ownership changes', async () => {
  const created = await postAdminBooking(
    adminBooking({ startTime: '09:00', phone: '+37499123997' })
  );
  const appointmentId = new mongoose.Types.ObjectId(
    created.body.data.appointment._id
  );
  const keyHash = '9'.repeat(64);
  await Appointment.collection.updateOne(
    { _id: appointmentId },
    {
      $set: {
        idempotencyKeyHash: keyHash,
        idempotencyRequestHash: 'a'.repeat(64),
      },
    }
  );

  await assert.rejects(
    bookingIdempotencyMigration.run({
      dryRun: false,
      beforeAppointmentWrite: async (appointment) => {
        if (String(appointment._id) !== String(appointmentId)) return;
        await Appointment.collection.updateOne(
          { _id: appointmentId },
          { $set: { idempotencyRequestHash: 'b'.repeat(64) } }
        );
      },
    }),
    /idempotency state changed during migration/
  );
  assert.equal(await BookingIdempotency.countDocuments({ keyHash }), 0);
  const preserved = await Appointment.collection.findOne({
    _id: appointmentId,
  });
  assert.equal(preserved.idempotencyKeyHash, keyHash);
  assert.equal(preserved.idempotencyRequestHash, 'b'.repeat(64));
});


test('migration runner installs replay TTL before an interrupted snapshot copy', async () => {
  const created = await Promise.all([
    postAdminBooking(
      adminBooking({ startTime: '09:00', phone: '+37499123068' })
    ),
    postAdminBooking(
      adminBooking({ startTime: '11:00', phone: '+37499123078' })
    ),
  ]);
  const appointmentIds = created.map(({ body }) => (
    new mongoose.Types.ObjectId(body.data.appointment._id)
  ));
  await BookingIdempotency.deleteMany({});
  await Appointment.collection.updateOne(
    { _id: appointmentIds[0] },
    {
      $set: {
        idempotencyKeyHash: '1'.repeat(64),
        idempotencyRequestHash: '2'.repeat(64),
      },
    }
  );
  await Appointment.collection.updateOne(
    { _id: appointmentIds[1] },
    {
      $set: {
        idempotencyKeyHash: '3'.repeat(64),
        idempotencyRequestHash: '4'.repeat(64),
      },
    }
  );
  await BookingIdempotency.collection.dropIndex('expiresAt_1');
  let writes = 0;
  const candidate = {
    ...bookingIdempotencyMigration,
    version: 'test_interrupted_idempotency_008',
    run: (options) => bookingIdempotencyMigration.run({
      ...options,
      beforeAppointmentWrite: async () => {
        writes += 1;
        if (writes === 2) throw new Error('injected migration interruption');
      },
    }),
  };

  await assert.rejects(
    runMigrations({ dryRun: false, migrationSet: [candidate] }),
    /injected migration interruption/
  );

  const ttl = (await BookingIdempotency.collection.indexes())
    .find(({ key }) => key.expiresAt === 1);
  assert.equal(Number(ttl?.expireAfterSeconds), 0);
  assert.equal(await BookingIdempotency.countDocuments(), 1);
  assert.equal(
    (await Migration.collection.findOne({ version: candidate.version })).state,
    'failed'
  );
});
