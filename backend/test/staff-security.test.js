import test, {
  after,
  before,
  beforeEach,
} from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.MONGO_URI =
  'mongodb://127.0.0.1:27017/dental_clinic_test';
process.env.JWT_SECRET =
  'test-only-secret-that-is-at-least-thirty-two-characters';
process.env.JWT_EXPIRES_IN = '15m';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.FRONTEND_URL =
  'https://staff.clinic.example.test';
process.env.CORS_ORIGINS =
  'http://localhost:5173,https://staff.clinic.example.test';

const {
  connectReplTestDatabase,
  clearReplTestDatabase,
  disconnectReplTestDatabase,
} = await import('../test-support/replDatabase.js');
const { seedStaff } = await import(
  '../test-support/fixtures.js'
);
const { default: app } = await import('../src/app.js');
const { default: User } = await import(
  '../src/modules/users/user.model.js'
);
const { default: Session } = await import(
  '../src/modules/sessions/session.model.js'
);
const { default: OneTimeToken } = await import(
  '../src/modules/auth/oneTimeToken.model.js'
);
const { default: generateToken } = await import(
  '../src/utils/generateToken.js'
);
const {
  setMailAdapterForTests,
  resetMailAdapterForTests,
} = await import('../src/mail/mail.service.js');
const authFieldsMigration = await import(
  '../src/migrations/20260814_003_auth_security_fields.js'
);

let staff;
let sentMail;

before(connectReplTestDatabase);

beforeEach(async () => {
  await clearReplTestDatabase();
  staff = await seedStaff();
  sentMail = [];
  setMailAdapterForTests({
    async send(message) {
      sentMail.push(message);
    },
  });
});

after(async () => {
  resetMailAdapterForTests();
  await disconnectReplTestDatabase();
});

const bearer = (token) => ({
  Authorization: `Bearer ${token}`,
});

const cookiePair = (response) => (
  response.headers['set-cookie'][0].split(';')[0]
);

const login = (email, password) => request(app)
  .post('/api/v1/auth/login')
  .send({ email, password });

const tokenFromMail = (mail) => {
  const url = mail.text.match(/https:\/\/\S+/)[0];
  const parsed = new URL(url);
  assert.equal(parsed.search, '');
  return new URLSearchParams(parsed.hash.slice(1)).get('token');
};

test('password policy accepts six, rejects five and bcrypt-truncating UTF-8 inputs, and never trims', async () => {
  const six = await User.create({
    name: 'Six Password',
    email: 'six@example.com',
    password: '123456',
    role: 'receptionist',
  });
  const selectedSix = await User.findById(six._id)
    .select('+password');
  assert.equal(
    await selectedSix.comparePassword('123456'),
    true
  );

  await assert.rejects(
    User.create({
      name: 'Five Password',
      email: 'five@example.com',
      password: '12345',
    }),
    (error) => error.name === 'ValidationError'
  );

  const spaced = await User.create({
    name: 'Space Password',
    email: 'space@example.com',
    password: '12345 ',
  });
  const selectedSpaced = await User.findById(spaced._id)
    .select('+password');
  assert.equal(
    await selectedSpaced.comparePassword('12345 '),
    true
  );
  assert.equal(
    await selectedSpaced.comparePassword('12345'),
    false
  );

  const seventyTwoBytes = await User.create({
    name: 'Seventy Two Bytes',
    email: 'seventy-two@example.com',
    password: 'a'.repeat(72),
  });
  assert.ok(seventyTwoBytes._id);

  const unicodeSix = await User.create({
    name: 'Unicode Six',
    email: 'unicode-six@example.com',
    password: '😀'.repeat(6),
  });
  assert.ok(unicodeSix._id);

  await assert.rejects(
    User.create({
      name: 'Seventy Three Bytes',
      email: 'seventy-three@example.com',
      password: 'a'.repeat(73),
    }),
    (error) => error.name === 'ValidationError'
  );

  await assert.rejects(
    User.create({
      name: 'Byte Overflow',
      email: 'overflow@example.com',
      password: '😀'.repeat(19),
    }),
    (error) => error.name === 'ValidationError'
  );
});

test('legacy hashes with passwords beyond 72 bytes remain login-compatible', async () => {
  const legacyPassword = 'a'.repeat(80);
  const passwordHash = await bcrypt.hash(
    legacyPassword,
    12
  );

  await User.collection.insertOne({
    name: 'Legacy User',
    email: 'legacy@example.com',
    password: passwordHash,
    role: 'receptionist',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  assert.equal(
    (await login('legacy@example.com', legacyPassword))
      .status,
    200
  );
});

test('legacy auth field migration is dry-run safe and idempotent', async () => {
  const userId = staff.receptionist._id;
  await User.collection.updateOne(
    { _id: userId },
    {
      $unset: {
        authVersion: '',
        isSetupComplete: '',
      },
    }
  );
  const legacySessionId = (
    await Session.collection.insertOne({
      user: userId,
      tokenHash: 'f'.repeat(64),
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      consumedTokenHashes: [],
      userAgent: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  ).insertedId;

  const dryRun = await authFieldsMigration.run({
    dryRun: true,
  });
  assert.equal(dryRun.usersScanned, 1);
  assert.equal(dryRun.sessionsScanned, 1);
  assert.equal(
    (await User.collection.findOne({ _id: userId }))
      .authVersion,
    undefined
  );

  await authFieldsMigration.run({ dryRun: false });
  await authFieldsMigration.run({ dryRun: false });
  const migratedUser = await User.collection.findOne({
    _id: userId,
  });
  const migratedSession =
    await Session.collection.findOne({
      _id: legacySessionId,
    });
  assert.equal(migratedUser.authVersion, 0);
  assert.equal(migratedUser.isSetupComplete, true);
  assert.equal(typeof migratedSession.familyId, 'string');
});

test('admin invitation is hashed at rest, uses trusted frontend URL, and setup is single-use', async () => {
  const denied = await request(app)
    .post('/api/v1/staff/invite')
    .set(bearer(staff.receptionistToken))
    .send({
      name: 'Invited User',
      email: 'invited@example.com',
      role: 'dentist',
    });
  assert.equal(denied.status, 403);

  const invitation = await request(app)
    .post('/api/v1/staff/invite')
    .set(bearer(staff.adminToken))
    .send({
      name: 'Invited User',
      email: 'invited@example.com',
      role: 'dentist',
      isActive: true,
      authVersion: 999,
    });
  assert.equal(invitation.status, 201);
  assert.equal(invitation.body.data.staff.password, undefined);
  assert.equal(invitation.body.data.staff.authVersion, undefined);
  assert.equal(sentMail.length, 1);
  assert.match(
    sentMail[0].text,
    /^Use this one-time link to set your password: https:\/\/staff\.clinic\.example\.test\//
  );

  const token = tokenFromMail(sentMail[0]);
  const storedToken = await OneTimeToken.findOne()
    .select('+tokenHash')
    .lean();
  assert.equal(storedToken.tokenHash.length, 64);
  assert.equal(storedToken.tokenHash.includes(token), false);

  const invited = await User.findOne({
    email: 'invited@example.com',
  }).select('+password');
  assert.equal(invited.isActive, false);
  assert.equal(invited.isSetupComplete, false);
  assert.equal(invited.password, undefined);

  assert.equal(
    (await request(app)
      .post('/api/v1/auth/setup-password')
      .send({ token, password: '12345' })).status,
    400
  );
  assert.equal(
    (await request(app)
      .post('/api/v1/auth/setup-password')
      .send({ token, password: '123456' })).status,
    200
  );
  assert.equal(
    (await request(app)
      .post('/api/v1/auth/setup-password')
      .send({ token, password: 'abcdef' })).status,
    400
  );
  assert.equal(
    (await login('invited@example.com', '123456')).status,
    200
  );
});

test('forgot/reset is enumeration-safe, atomic, single-use, and invalidates all prior authorization', async () => {
  const loggedIn = await login(
    'admin@example.com',
    'correct horse battery staple'
  );
  const oldAccess = loggedIn.body.data.accessToken;
  const oldCookie = cookiePair(loggedIn);

  const existing = await request(app)
    .post('/api/v1/auth/forgot-password')
    .send({ email: 'admin@example.com' });
  const missing = await request(app)
    .post('/api/v1/auth/forgot-password')
    .send({ email: 'missing@example.com' });
  assert.equal(existing.status, 202);
  assert.equal(missing.status, 202);
  assert.equal(existing.body.message, missing.body.message);
  assert.equal(sentMail.length, 1);

  const token = tokenFromMail(sentMail[0]);
  const reset = await request(app)
    .post('/api/v1/auth/reset-password')
    .send({ token, password: 'abcdef' });
  assert.equal(reset.status, 200);
  assert.equal(reset.body.data.user.password, undefined);
  assert.equal(
    (await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token, password: 'ghijkl' })).status,
    400
  );
  assert.equal(
    (await request(app)
      .get('/api/v1/auth/me')
      .set(bearer(oldAccess))).status,
    401
  );
  assert.equal(
    (await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', oldCookie)).status,
    401
  );
  assert.equal(
    (await login('admin@example.com', 'abcdef')).status,
    200
  );
});

test('authenticated password change requires current password and forces a new login', async () => {
  const loggedIn = await login(
    'reception@example.com',
    'correct horse battery staple'
  );
  const access = loggedIn.body.data.accessToken;
  const cookie = cookiePair(loggedIn);

  assert.equal(
    (await request(app)
      .post('/api/v1/auth/change-password')
      .set(bearer(access))
      .send({
        currentPassword: 'wrong-password',
        newPassword: '123456',
      })).status,
    400
  );

  const changed = await request(app)
    .post('/api/v1/auth/change-password')
    .set(bearer(access))
    .set('Cookie', cookie)
    .send({
      currentPassword: 'correct horse battery staple',
      newPassword: '123456',
    });
  assert.equal(changed.status, 200);
  assert.match(changed.headers['set-cookie'][0], /refresh_token=;/);
  assert.equal(
    (await request(app)
      .get('/api/v1/auth/me')
      .set(bearer(access))).status,
    401
  );
  assert.equal(
    (await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookie)).status,
    401
  );
  assert.equal(
    (await login('reception@example.com', '123456'))
      .status,
    200
  );
});

test('role changes, deactivation, reactivation, and session revocation invalidate bearer tokens', async () => {
  const endpoint = `/api/v1/staff/${staff.receptionist._id}`;
  const roleChange = await request(app)
    .patch(`${endpoint}/role`)
    .set(bearer(staff.adminToken))
    .send({ role: 'dentist', isActive: true });
  assert.equal(roleChange.status, 200);
  assert.equal(roleChange.body.data.staff.role, 'dentist');
  assert.equal(roleChange.body.data.staff.authVersion, undefined);
  assert.equal(
    (await request(app)
      .get('/api/v1/auth/me')
      .set(bearer(staff.receptionistToken))).status,
    401
  );

  const current = await User.findById(staff.receptionist._id)
    .select('+authVersion');
  const currentToken = generateToken(current);
  assert.equal(
    (await request(app)
      .post(`${endpoint}/deactivate`)
      .set(bearer(staff.adminToken))).status,
    200
  );
  assert.equal(
    (await request(app)
      .get('/api/v1/auth/me')
      .set(bearer(currentToken))).status,
    401
  );
  assert.equal(
    (await request(app)
      .post(`${endpoint}/reactivate`)
      .set(bearer(staff.adminToken))).status,
    200
  );

  const reactivated = await User.findById(staff.receptionist._id)
    .select('+authVersion');
  const reactivatedToken = generateToken(reactivated);
  assert.equal(
    (await request(app)
      .post(`${endpoint}/revoke-sessions`)
      .set(bearer(staff.adminToken))).status,
    200
  );
  assert.equal(
    (await request(app)
      .get('/api/v1/auth/me')
      .set(bearer(reactivatedToken))).status,
    401
  );

  const list = await request(app)
    .get('/api/v1/staff')
    .set(bearer(staff.adminToken));
  assert.equal(list.status, 200);
  assert.equal(list.body.data.staff[0].password, undefined);
  assert.equal(list.body.data.staff[0].authVersion, undefined);
});

test('self-lockout is rejected and concurrent removals preserve one active admin', async () => {
  assert.equal(
    (await request(app)
      .post(`/api/v1/staff/${staff.admin._id}/deactivate`)
      .set(bearer(staff.adminToken))).status,
    409
  );
  assert.equal(
    (await request(app)
      .patch(`/api/v1/staff/${staff.admin._id}/role`)
      .set(bearer(staff.adminToken))
      .send({ role: 'dentist' })).status,
    409
  );

  const secondAdmin = await User.create({
    name: 'Second Admin',
    email: 'second-admin@example.com',
    password: '123456',
    role: 'admin',
  });
  const secondToken = generateToken(secondAdmin);

  const responses = await Promise.all([
    request(app)
      .post(`/api/v1/staff/${secondAdmin._id}/deactivate`)
      .set(bearer(staff.adminToken)),
    request(app)
      .post(`/api/v1/staff/${staff.admin._id}/deactivate`)
      .set(bearer(secondToken)),
  ]);

  assert.deepEqual(
    responses.map(({ status }) => status).sort(),
    [200, 409]
  );
  assert.equal(
    await User.countDocuments({
      role: 'admin',
      isActive: true,
      isSetupComplete: true,
    }),
    1
  );
});
