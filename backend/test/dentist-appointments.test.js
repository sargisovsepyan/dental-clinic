import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/dental_clinic_test';
process.env.JWT_SECRET = 'test-only-secret-that-is-at-least-thirty-two-characters';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.CLINIC_TIMEZONE = 'Asia/Yerevan';

const { connectReplTestDatabase, clearReplTestDatabase, disconnectReplTestDatabase } = await import('../test-support/replDatabase.js');
const { seedCore, seedStaff, publicBooking } = await import('../test-support/fixtures.js');
const { default: app } = await import('../src/app.js');
const { default: User } = await import('../src/modules/users/user.model.js');
const { default: Dentist } = await import('../src/modules/dentists/dentist.model.js');
const { default: Service } = await import('../src/modules/services/service.model.js');
const { default: Appointment } = await import('../src/modules/appointments/appointment.model.js');
const { createAppointment } = await import('../src/modules/appointments/appointment.service.js');
const { getMyAppointments } = await import('../src/modules/appointments/assignedAppointment.service.js');

let core, staff, own, other;
const auth = (token) => ({ Authorization: `Bearer ${token}` });
before(connectReplTestDatabase);
beforeEach(async () => {
  await clearReplTestDatabase();
  core = await seedCore(); staff = await seedStaff();
  await User.updateOne({ _id: staff.dentistUser._id }, { $set: { dentistProfile: core.dentist._id } });
  own = await createAppointment({ ...publicBooking(core, '09:00', '901'), internalNote: 'PRIVATE-NOTE' });
  other = await createAppointment({ ...publicBooking(core, '10:00', '902'), dentistId: String(core.secondDentist._id) });
});
after(disconnectReplTestDatabase);

test('assigned list and detail are paginated, no-store, and explicitly privacy-minimized', async () => {
  const identity = await request(app).get('/api/v1/auth/me').set(auth(staff.dentistToken));
  assert.equal(identity.status, 200);
  assert.equal(identity.body.data.user.authVersion, undefined);
  assert.equal(identity.body.data.user.dentistProfile, undefined);
  const result = await request(app).get('/api/v1/appointments/mine?limit=1').set(auth(staff.dentistToken));
  assert.equal(result.status, 200); assert.match(result.headers['cache-control'], /no-store/);
  assert.equal(result.body.data.pagination.total, 1);
  const row = result.body.data.appointments[0];
  assert.equal(row._id, String(own._id));
  assert.deepEqual(Object.keys(row).sort(), ['_id', 'date', 'endTime', 'patientName', 'patientPhone', 'serviceSnapshot', 'startTime', 'status']);
  assert.deepEqual(Object.keys(row.serviceSnapshot).sort(), ['durationMinutes', 'name', 'translations']);
  assert.equal((await request(app).get(`/api/v1/appointments/mine/details/${own._id}`).set(auth(staff.dentistToken))).status, 200);
  assert.equal((await request(app).get(`/api/v1/appointments/mine/details/${other._id}`).set(auth(staff.dentistToken))).status, 404);
  const page = await request(app).get('/api/v1/appointments/mine?page=2&limit=1').set(auth(staff.dentistToken));
  assert.deepEqual(page.body.data.appointments, []);
});

test('translated appointment snapshots remain immutable when published names change', async () => {
  await Dentist.updateOne({ _id: core.dentist._id }, { $set: {
    'translations.en.firstName': 'Davit', 'translations.en.lastName': 'Petrosyan',
    'translations.ru.firstName': 'Давид', 'translations.ru.lastName': 'Петросян',
  } });
  await Service.updateOne({ _id: core.service._id }, { $set: { 'translations.en.name': 'Hygiene', 'translations.ru.name': 'Гигиена' } });
  const saved = await createAppointment(publicBooking(core, '11:00', '905'));
  await Dentist.updateOne({ _id: core.dentist._id }, { $set: { 'translations.en.firstName': 'Changed' } });
  await Service.updateOne({ _id: core.service._id }, { $set: { 'translations.en.name': 'Changed service' } });
  const ownDetail = await request(app).get(`/api/v1/appointments/mine/details/${saved._id}`).set(auth(staff.dentistToken));
  assert.equal(ownDetail.status, 200);
  assert.equal(ownDetail.body.data.appointment.serviceSnapshot.translations.en.name, 'Hygiene');
  assert.equal(ownDetail.body.data.appointment.serviceSnapshot.translations.ru.name, 'Гигиена');
  assert.equal(ownDetail.body.data.appointment.dentistSnapshot, undefined);
  const stored = await Appointment.findById(saved._id).lean();
  assert.equal(stored.dentistSnapshot.translations.en.firstName, 'Davit');
  assert.equal(stored.dentistSnapshot.translations.ru.lastName, 'Петросян');
});

test('arbitrary scopes, invalid dates, and all management endpoints remain forbidden', async () => {
  for (const query of [`dentistId=${core.secondDentist._id}`, 'phone=+37499123902', 'status=confirmed', 'date=2026-02-31', 'from=2026-12-01&to=2026-01-01', 'limit=51', `id=${other._id}`]) {
    assert.equal((await request(app).get(`/api/v1/appointments/mine?${query}`).set(auth(staff.dentistToken))).status, 400, query);
  }
  for (const path of ['/api/v1/appointments', `/api/v1/appointments/${own._id}`, '/api/v1/staff', '/api/v1/audit-logs', '/api/v1/services/admin/all', '/api/v1/dentists/admin/all']) {
    assert.equal((await request(app).get(path).set(auth(staff.dentistToken))).status, 403);
  }
  assert.equal((await request(app).get('/api/v1/appointments/mine')).status, 401);
  assert.equal((await request(app).get('/api/v1/appointments/mine').set(auth(staff.receptionistToken))).status, 403);
});

test('reads follow the current database association and fail closed when unlinked or inactive', async () => {
  await User.updateOne({ _id: staff.dentistUser._id }, { $set: { dentistProfile: core.secondDentist._id } });
  const data = await getMyAppointments(staff.dentistUser._id, { page: 1, limit: 25 }, 0);
  assert.equal(String(data.appointments[0]._id), String(other._id));
  await Dentist.updateOne({ _id: core.secondDentist._id }, { $set: { isActive: false } });
  assert.equal((await request(app).get('/api/v1/appointments/mine').set(auth(staff.dentistToken))).status, 403);
  await User.updateOne({ _id: staff.dentistUser._id }, { $set: { dentistProfile: null } });
  assert.equal((await request(app).get('/api/v1/appointments/mine').set(auth(staff.dentistToken))).status, 403);
});

test('only admins may change care assignment; a change revokes old access', async () => {
  const path = `/api/v1/staff/${staff.dentistUser._id}/dentist-profile`;
  assert.equal((await request(app).put(path).set(auth(staff.dentistToken)).send({ dentistId: String(core.secondDentist._id) })).status, 403);
  assert.equal((await request(app).put(path).set(auth(staff.receptionistToken)).send({ dentistId: null })).status, 403);
  assert.equal((await request(app).put(`/api/v1/staff/${staff.admin._id}/dentist-profile`).set(auth(staff.adminToken)).send({ dentistId: String(core.dentist._id) })).status, 409);
  assert.equal((await request(app).put(path).set(auth(staff.adminToken)).send({ dentistId: '000000000000000000000001' })).status, 400);
  assert.equal((await request(app).put(path).set(auth(staff.adminToken)).send({ dentistId: null, role: 'admin' })).status, 400);
  const result = await request(app).put(path).set(auth(staff.adminToken)).send({ dentistId: String(core.secondDentist._id) });
  assert.equal(result.status, 200); assert.equal(result.body.data.dentistId, String(core.secondDentist._id));
  assert.equal((await request(app).get('/api/v1/appointments/mine').set(auth(staff.dentistToken))).status, 401);
});

test('an assignment/version change while fetching suppresses the stale patient response', async () => {
  const original = Appointment.find;
  Appointment.find = function (...args) {
    const query = original.apply(this, args);
    const lean = query.lean.bind(query);
    query.lean = async () => {
      const rows = await lean();
      await User.updateOne({ _id: staff.dentistUser._id }, { $inc: { authVersion: 1 } });
      return rows;
    };
    return query;
  };
  try {
    await assert.rejects(getMyAppointments(staff.dentistUser._id, { page: 1, limit: 25 }, 0), (error) => error.code === 'DENTIST_PROFILE_REQUIRED');
  } finally { Appointment.find = original; }
});

for (const operation of ['list', 'detail']) {
  test(`assignment revocation between authentication and the initial ${operation} lookup exposes no patient data`, async () => {
    const original = User.findOne;
    let changed = false;
    User.findOne = function (...args) {
      const query = original.apply(this, args);
      if (args[0]?.role === 'dentist' && !changed) {
        const lean = query.lean.bind(query);
        query.lean = async () => {
          changed = true;
          await User.updateOne({ _id: staff.dentistUser._id }, { $set: { dentistProfile: core.secondDentist._id }, $inc: { authVersion: 1 } });
          return lean();
        };
      }
      return query;
    };
    try {
      const path = operation === 'list' ? '/api/v1/appointments/mine' : `/api/v1/appointments/mine/details/${other._id}`;
      const result = await request(app).get(path).set(auth(staff.dentistToken));
      assert.equal(changed, true); assert.equal(result.status, 403);
      assert.equal(result.body.code, 'DENTIST_PROFILE_REQUIRED');
      assert.equal(result.body.data, undefined);
      assert.ok(!JSON.stringify(result.body).includes(other.patientName));
      assert.ok(!JSON.stringify(result.body).includes(other.patientPhone));
    } finally { User.findOne = original; }
  });
}
