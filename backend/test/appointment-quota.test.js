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
  connectTestDatabase,
  clearTestDatabase,
  disconnectTestDatabase,
} = await import('../test-support/database.js');
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
const { default: Clinic } = await import(
  '../src/modules/clinic/clinic.model.js'
);
const {
  getPhoneQuotaKey,
  reconcilePhoneDailyQuotas,
} = await import(
  '../src/modules/appointments/phoneDailyQuota.service.js'
);
const quotaMigration = await import(
  '../src/migrations/20260814_002_phone_daily_quota.js'
);

let core;
let staff;

before(async () => {
  await connectTestDatabase();
  await Promise.all([
    Appointment.init(),
    PhoneDailyQuota.init(),
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
  .send(data);

const cancel = (id) => request(app)
  .post(`/api/v1/appointments/${id}/cancel`)
  .set(auth())
  .send({ reason: 'Quota lifecycle test' });

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
  assert.equal(
    (await getQuota(phone, core.date)).reservations
      .length,
    1
  );

  const moved = await reschedule(id, {
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
