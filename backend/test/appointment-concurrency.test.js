import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/dental_clinic_test';
process.env.JWT_SECRET = 'test-only-secret-that-is-at-least-thirty-two-characters';
process.env.JWT_EXPIRES_IN = '15m';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.CLINIC_TIMEZONE = 'Asia/Yerevan';

const { connectTestDatabase, clearTestDatabase, disconnectTestDatabase } = await import('../test-support/database.js');
const { seedCore, publicBooking } = await import('../test-support/fixtures.js');
const { default: app } = await import('../src/app.js');
const { default: Appointment } = await import('../src/modules/appointments/appointment.model.js');
const { default: User } = await import('../src/modules/users/user.model.js');
const { default: generateToken } = await import('../src/utils/generateToken.js');
const appointmentService = await import('../src/modules/appointments/appointment.service.js');

let core;
let adminToken;

before(async () => {
  await connectTestDatabase();
  await Appointment.init();
});

beforeEach(async () => {
  await clearTestDatabase();
  core = await seedCore();
  const admin = await User.create({
    name: 'Admin User',
    email: 'admin@example.com',
    password: 'correct horse battery staple',
    role: 'admin',
  });
  adminToken = generateToken(admin);
});

after(disconnectTestDatabase);

const postBooking = (body) => request(app)
  .post('/api/v1/appointments')
  .send(body);

const authPatch = (path, body) => request(app)
  .patch(path)
  .set('Authorization', `Bearer ${adminToken}`)
  .send(body);

const createDirect = (startTime, suffix = '800') => appointmentService.createAppointment(
  publicBooking(core, startTime, suffix),
);

test('MongoDB has the unique dentist booking-lock index', async () => {
  const indexes = await Appointment.collection.indexes();
  const lockIndex = indexes.find((index) => index.name === 'unique_dentist_booking_lock');
  assert.deepEqual(lockIndex.key, { dentist: 1, lockKeys: 1 });
  assert.equal(lockIndex.unique, true);
});

test('concurrent HTTP requests for the exact same slot return one 201 and one 409', async () => {
  const responses = await Promise.all([
    postBooking(publicBooking(core, '09:00', '101')),
    postBooking(publicBooking(core, '09:00', '102')),
  ]);
  assert.deepEqual(responses.map(({ status }) => status).sort(), [201, 409]);
  assert.equal(await Appointment.countDocuments(), 1);
});

test('concurrent HTTP requests with different overlapping starts have one winner', async () => {
  const responses = await Promise.all([
    postBooking(publicBooking(core, '09:00', '201')),
    postBooking(publicBooking(core, '09:30', '202')),
  ]);
  assert.deepEqual(responses.map(({ status }) => status).sort(), [201, 409]);
  assert.equal(await Appointment.countDocuments(), 1);
});

test('concurrent booking versus reschedule leaves exactly one owner of the target slot', async () => {
  const original = await createDirect('10:00', '301');
  const responses = await Promise.all([
    postBooking(publicBooking(core, '14:00', '302')),
    authPatch(`/api/v1/appointments/${original._id}/reschedule`, {
      date: core.date,
      startTime: '14:00',
    }),
  ]);

  assert.equal(responses.filter(({ status }) => status === 409).length, 1);
  assert.equal(responses.filter(({ status }) => status === 200 || status === 201).length, 1);
  assert.equal(
    await Appointment.countDocuments({
      dentist: core.dentist._id,
      lockKeys: `${core.date}:840`,
    }),
    1,
  );
});

test('failed HTTP reschedule preserves and continues protecting the original slot', async () => {
  const original = await createDirect('10:00', '401');
  await createDirect('14:00', '402');

  const response = await authPatch(`/api/v1/appointments/${original._id}/reschedule`, {
    date: core.date,
    startTime: '14:00',
  });
  assert.equal(response.status, 409);

  const stored = await Appointment.findById(original._id).select('+lockKeys').lean();
  assert.equal(stored.startTime, '10:00');
  assert.ok(stored.lockKeys.includes(`${core.date}:600`));

  const retry = await postBooking(publicBooking(core, '10:00', '403'));
  assert.equal(retry.status, 409);
});

test('HTTP cancellation releases locks and makes the slot bookable', async () => {
  const original = await createDirect('11:00', '501');
  const cancellation = await request(app)
    .post(`/api/v1/appointments/${original._id}/cancel`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ reason: 'Patient requested cancellation' });
  assert.equal(cancellation.status, 200);

  const replacement = await postBooking(publicBooking(core, '11:00', '502'));
  assert.equal(replacement.status, 201);
});

test('different dentists can book the same clock time concurrently over HTTP', async () => {
  const second = {
    ...publicBooking(core, '15:00', '602'),
    dentistId: String(core.secondDentist._id),
  };
  const responses = await Promise.all([
    postBooking(publicBooking(core, '15:00', '601')),
    postBooking(second),
  ]);
  assert.deepEqual(responses.map(({ status }) => status).sort(), [201, 201]);
});

test('rescheduling to the current slot succeeds because availability excludes that appointment', async () => {
  const original = await createDirect('12:00', '701');
  const response = await authPatch(`/api/v1/appointments/${original._id}/reschedule`, {
    date: core.date,
    startTime: '12:00',
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.data.appointment.startTime, '12:00');
});

test('concurrent reschedules reject one stale write instead of silently losing an update', async () => {
  const original = await createDirect('10:00', '801');
  const path = `/api/v1/appointments/${original._id}/reschedule`;

  const responses = await Promise.all([
    authPatch(path, {
      date: core.date,
      startTime: '14:00',
    }),
    authPatch(path, {
      date: core.date,
      startTime: '16:00',
    }),
  ]);

  assert.deepEqual(
    responses.map(({ status }) => status).sort(),
    [200, 409],
  );

  const winner = responses.find(({ status }) => status === 200);
  const stored = await Appointment.findById(original._id).lean();
  assert.equal(stored.startTime, winner.body.data.appointment.startTime);
});
