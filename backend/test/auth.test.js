import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/dental_clinic_test';
process.env.JWT_SECRET = 'test-only-secret-that-is-at-least-thirty-two-characters';
process.env.JWT_EXPIRES_IN = '15m';
process.env.CLIENT_URL = 'http://localhost:5173';

const {
  connectReplTestDatabase: connectTestDatabase,
  clearReplTestDatabase: clearTestDatabase,
  disconnectReplTestDatabase: disconnectTestDatabase,
} = await import('../test-support/replDatabase.js');
const { seedStaff } = await import('../test-support/fixtures.js');
const { default: app } = await import('../src/app.js');
const { default: User } = await import('../src/modules/users/user.model.js');
const { default: Session } = await import('../src/modules/sessions/session.model.js');
const { default: AuditLog } = await import('../src/modules/audit/audit.model.js');
const { hashToken } = await import('../src/utils/refreshToken.js');

let staff;

before(async () => {
  await connectTestDatabase();
  await clearTestDatabase();
  staff = await seedStaff();
});

beforeEach(async () => {
  await Session.deleteMany({});
  await AuditLog.deleteMany({});
  await User.updateMany({}, {
    $set: {
      isActive: true,
      isSetupComplete: true,
      authVersion: 0,
    },
  });
});

after(disconnectTestDatabase);

const login = (password = 'correct horse battery staple') => request(app)
  .post('/api/v1/auth/login')
  .send({ email: 'admin@example.com', password });

const cookiePair = (response) => response.headers['set-cookie'][0].split(';')[0];

const findAudit = async (action) => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const log = await AuditLog.findOne({ action }).lean();
    if (log) {
      return log;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return null;
};

test('successful login returns safe user data, access token, and hardened refresh cookie', async () => {
  const response = await login();
  assert.equal(response.status, 200);
  assert.equal(response.body.data.user.email, 'admin@example.com');
  assert.equal(typeof response.body.data.accessToken, 'string');
  assert.equal(response.body.data.user.password, undefined);

  const setCookie = response.headers['set-cookie'][0];
  assert.match(setCookie, /^refresh_token=/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Strict/i);
  assert.match(setCookie, /Path=\/api\/v1\/auth/i);
  assert.doesNotMatch(setCookie, /; Secure/i);

  const session = await Session.findOne().lean();
  assert.equal(session.tokenHash.length, 64);
  assert.equal(setCookie.includes(session.tokenHash), false);

  const audit = await findAudit('auth.login.success');
  assert.equal(String(audit.actor), String(staff.admin._id));
  assert.equal(audit.entityType, 'user');
  assert.equal(audit.method, 'POST');
});

test('login rejects an incorrect password and missing credentials', async () => {
  assert.equal((await login('incorrect password')).status, 401);
  assert.equal((await request(app).post('/api/v1/auth/login').send({})).status, 400);
});

test('login failures are limited by normalized account independently of IP', async () => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'target@example.com',
        password: 'incorrect password',
      });
    assert.equal(response.status, 401);
  }

  const limited = await request(app)
    .post('/api/v1/auth/login')
    .send({
      email: 'TARGET@example.com',
      password: 'incorrect password',
    });
  assert.equal(limited.status, 429);
  assert.ok(limited.headers['retry-after']);

  const otherAccount = await request(app)
    .post('/api/v1/auth/login')
    .send({
      email: 'other-target@example.com',
      password: 'incorrect password',
    });
  assert.equal(otherAccount.status, 401);
});

test('new staff records accept six characters and reject five', async () => {
  const accepted = await User.create({
    name: 'Six Character User',
    email: 'six-character@example.com',
    password: '123456',
    role: 'receptionist',
  });
  assert.ok(accepted._id);

  await assert.rejects(
    User.create({
      name: 'Weak Password User',
      email: 'weak-password@example.com',
      password: '12345',
      role: 'receptionist',
    }),
    (error) => error.name === 'ValidationError',
  );
});

test('protected endpoint rejects missing, malformed, invalid, and expired access tokens', async () => {
  assert.equal((await request(app).get('/api/v1/auth/me')).status, 401);
  assert.equal((await request(app).get('/api/v1/auth/me').set('Authorization', 'Token nope')).status, 401);
  assert.equal((await request(app).get('/api/v1/auth/me').set('Authorization', 'Bearer not-a-jwt')).status, 401);

  const expired = jwt.sign(
    { sub: String(staff.admin._id), role: 'admin' },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: -1 },
  );
  assert.equal((await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${expired}`)).status, 401);
});

test('access-token verification only accepts HS256', async () => {
  const wrongAlgorithm = jwt.sign(
    { sub: String(staff.admin._id), role: 'admin' },
    process.env.JWT_SECRET,
    { algorithm: 'HS512', expiresIn: '5m' },
  );
  const response = await request(app)
    .get('/api/v1/auth/me')
    .set('Authorization', `Bearer ${wrongAlgorithm}`);
  assert.equal(response.status, 401);
});

test('RBAC permits admin and rejects receptionist and dentist on admin-only routes', async () => {
  const endpoint = '/api/v1/audit-logs';
  const adminResponse = await request(app).get(endpoint).set('Authorization', `Bearer ${staff.adminToken}`);
  const receptionistResponse = await request(app).get(endpoint).set('Authorization', `Bearer ${staff.receptionistToken}`);
  const dentistResponse = await request(app).get(endpoint).set('Authorization', `Bearer ${staff.dentistToken}`);
  assert.equal(adminResponse.status, 200);
  assert.equal(receptionistResponse.status, 403);
  assert.equal(dentistResponse.status, 403);
});

test('refresh rotates once and replay revokes the entire user session family', async () => {
  const loginResponse = await login();
  const oldAccess = loginResponse.body.data.accessToken;
  const oldCookie = cookiePair(loginResponse);
  const refreshResponse = await request(app).post('/api/v1/auth/refresh').set('Cookie', oldCookie);
  assert.equal(refreshResponse.status, 200);
  const newCookie = cookiePair(refreshResponse);
  assert.notEqual(newCookie, oldCookie);
  assert.equal((await request(app).post('/api/v1/auth/refresh').set('Cookie', oldCookie)).status, 401);
  assert.equal((await request(app).post('/api/v1/auth/refresh').set('Cookie', newCookie)).status, 401);
  assert.equal((await Session.countDocuments({ revokedAt: { $ne: null } })) > 0, true);
  assert.equal(
    (await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${oldAccess}`)).status,
    401,
  );
  assert.ok(await findAudit('auth.refresh.reuse_detected'));
});

test('concurrent HTTP refresh replay permits exactly one rotation', async () => {
  const currentCookie = cookiePair(await login());
  const responses = await Promise.all([
    request(app).post('/api/v1/auth/refresh').set('Cookie', currentCookie),
    request(app).post('/api/v1/auth/refresh').set('Cookie', currentCookie),
  ]);
  assert.deepEqual(responses.map(({ status }) => status).sort(), [200, 401]);
  const winner = responses.find(({ status }) => status === 200);
  assert.equal(
    (await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookiePair(winner))).status,
    401,
  );
});

test('logout revokes the current session, clears the cookie, and prevents refresh', async () => {
  const currentCookie = cookiePair(await login());
  const logoutResponse = await request(app).post('/api/v1/auth/logout').set('Cookie', currentCookie);
  assert.equal(logoutResponse.status, 200);
  assert.match(logoutResponse.headers['set-cookie'][0], /Path=\/api\/v1\/auth/i);
  assert.equal((await request(app).post('/api/v1/auth/refresh').set('Cookie', currentCookie)).status, 401);
  assert.equal((await Session.countDocuments({ revokedAt: { $ne: null } })), 1);
});

test('expired and inactive-user sessions cannot refresh', async () => {
  const expiredToken = 'expired-refresh-token';
  await Session.create({
    user: staff.admin._id,
    tokenHash: hashToken(expiredToken),
    expiresAt: new Date(Date.now() - 1_000),
  });
  assert.equal((await request(app).post('/api/v1/auth/refresh').set('Cookie', `refresh_token=${expiredToken}`)).status, 401);

  const activeCookie = cookiePair(await login());
  await User.updateOne({ _id: staff.admin._id }, { $set: { isActive: false } });
  assert.equal((await request(app).post('/api/v1/auth/refresh').set('Cookie', activeCookie)).status, 401);
  assert.equal((await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${staff.adminToken}`)).status, 401);
});
