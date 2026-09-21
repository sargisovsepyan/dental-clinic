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
const { seedStaff, seedCore } = await import(
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
const dentistStaffLinksMigration = await import(
  '../src/migrations/20260921_012_dentist_staff_links.js'
);

let staff;
let core;
let sentMail;

before(async () => {
  await connectReplTestDatabase();
  await User.init();
});

beforeEach(async () => {
  await clearReplTestDatabase();
  staff = await seedStaff();
  core = await seedCore();
  await User.updateOne(
    { _id: staff.dentistUser._id },
    { $set: { dentistProfile: core.dentist._id } }
  );
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

test('admin staff listing uses validated defaults, booleans, and deterministic pages', async () => {
  await User.create({ name: 'Pending Staff', email: 'pending@example.test', role: 'dentist', dentistProfile: core.secondDentist._id, isActive: false, isSetupComplete: false });
  await User.create({ name: 'Archived Staff', email: 'archived@example.test', password: '123456', role: 'receptionist', isActive: false, isSetupComplete: true, deactivatedAt: new Date() });
  const defaults = await request(app).get('/api/v1/staff').set(bearer(staff.adminToken));
  assert.equal(defaults.status, 200);
  assert.deepEqual(defaults.body.data.pagination, { page: 1, limit: 50, total: 5, pages: 1 });
  const pending = await request(app).get('/api/v1/staff?isActive=false&setupComplete=false&role=dentist').set(bearer(staff.adminToken));
  assert.equal(pending.status, 200);
  assert.equal(pending.body.data.staff.length, 1);
  assert.equal(pending.body.data.staff[0].name, 'Pending Staff');
  const current = await request(app).get('/api/v1/staff?lifecycle=current').set(bearer(staff.adminToken));
  assert.equal(current.status, 200);
  assert.equal(current.body.data.pagination.total, 4);
  assert.equal(current.body.data.staff.some(({ name }) => name === 'Archived Staff'), false);
  const deactivated = await request(app).get('/api/v1/staff?lifecycle=deactivated').set(bearer(staff.adminToken));
  assert.equal(deactivated.status, 200);
  assert.deepEqual(deactivated.body.data.staff.map(({ name }) => name), ['Archived Staff']);
  assert.equal((await request(app).get('/api/v1/staff?lifecycle=current&isActive=true').set(bearer(staff.adminToken))).status, 400);
  const secondPage = await request(app).get('/api/v1/staff?page=2&limit=2').set(bearer(staff.adminToken));
  assert.equal(secondPage.status, 200);
  assert.deepEqual(secondPage.body.data.staff.map(({ name }) => name), ['Dentist User', 'Pending Staff']);
});

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

test('dentist staff-link migration dry-runs preconditions and applies additively and idempotently', async () => {
  const missingProfile = await User.create({
    name: 'Unlinked Dentist',
    email: 'unlinked-dentist@example.com',
    password: '123456',
    role: 'dentist',
  });
  await User.collection.updateOne(
    { _id: staff.receptionist._id },
    { $set: { dentistProfile: core.secondDentist._id } }
  );

  const dryRun = await dentistStaffLinksMigration.run({ dryRun: true });
  assert.equal(dryRun.duplicateCurrentDentistLinks, 0);
  assert.equal(dryRun.currentDentistsWithoutProfiles, 1);
  assert.equal(dryRun.currentNonDentistsWithProfiles, 1);
  assert.equal(dryRun.indexCreated, false);
  await assert.rejects(
    dentistStaffLinksMigration.run({ dryRun: false }),
    /preconditions/
  );

  await User.deleteOne({ _id: missingProfile._id });
  await User.collection.updateOne(
    { _id: staff.receptionist._id },
    { $unset: { dentistProfile: '' } }
  );
  let leaseChecks = 0;
  const applied = await dentistStaffLinksMigration.run({
    dryRun: false,
    assertLease: async () => { leaseChecks += 1; },
  });
  const repeated = await dentistStaffLinksMigration.run({ dryRun: false });
  assert.equal(applied.indexCreated, true);
  assert.equal(repeated.indexCreated, true);
  assert.equal(leaseChecks, 2);
  assert.ok((await User.collection.indexes()).some((index) => (
    index.name === 'unique_current_dentist_staff_profile' && index.unique === true
  )));
});

test('admin invitation is hashed at rest, uses trusted frontend URL, and setup is single-use', async () => {
  const denied = await request(app)
    .post('/api/v1/staff/invite')
    .set(bearer(staff.receptionistToken))
    .send({
      name: 'Invited User',
      email: 'invited@example.com',
      role: 'dentist',
      dentistProfileId: String(core.secondDentist._id),
    });
  assert.equal(denied.status, 403);

  const invitation = await request(app)
    .post('/api/v1/staff/invite')
    .set(bearer(staff.adminToken))
    .send({
      name: 'Invited User',
      email: 'invited@example.com',
      role: 'dentist',
      dentistProfileId: String(core.secondDentist._id),
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

test('explicit invitation resend preserves identity, supersedes the prior token, and returns no secret', async () => {
  const invited = await request(app)
    .post('/api/v1/staff/invite')
    .set(bearer(staff.adminToken))
    .send({ name: 'Frozen Invitee', email: 'frozen@example.com', role: 'dentist', dentistProfileId: String(core.secondDentist._id) });
  assert.equal(invited.status, 201);
  const id = invited.body.data.staff._id;
  const original = tokenFromMail(sentMail[0]);

  const denied = await request(app)
    .post(`/api/v1/staff/${id}/resend-invitation`)
    .set(bearer(staff.receptionistToken))
    .send({});
  assert.equal(denied.status, 403);

  const resent = await request(app)
    .post(`/api/v1/staff/${id}/resend-invitation`)
    .set(bearer(staff.adminToken))
    .send({});
  assert.equal(resent.status, 200);
  assert.equal(sentMail.length, 2);
  assert.equal(JSON.stringify(resent.body).includes('token'), false);
  assert.deepEqual(
    (({ _id, name, email, role }) => ({ _id, name, email, role }))(resent.body.data.staff),
    (({ _id, name, email, role }) => ({ _id, name, email, role }))(invited.body.data.staff)
  );
  const replacement = tokenFromMail(sentMail[1]);
  assert.notEqual(replacement, original);
  assert.equal(await OneTimeToken.countDocuments({ user: id, purpose: 'invite', consumedAt: null }), 1);
  assert.equal((await request(app).post('/api/v1/auth/setup-password').send({ token: original, password: '123456' })).status, 400);
  assert.equal((await request(app).post('/api/v1/auth/setup-password').send({ token: replacement, password: '123456' })).status, 200);
  assert.equal((await request(app).post(`/api/v1/staff/${id}/resend-invitation`).set(bearer(staff.adminToken)).send({})).status, 409);
});

test('an expired invitation cannot provide context or complete account setup', async () => {
  const invited = await request(app)
    .post('/api/v1/staff/invite')
    .set(bearer(staff.adminToken))
    .send({ name: 'Expired Invite', email: 'expired-invite@example.com', role: 'receptionist' });
  assert.equal(invited.status, 201);
  const token = tokenFromMail(sentMail[0]);
  await OneTimeToken.updateOne(
    { user: invited.body.data.staff._id, purpose: 'invite', consumedAt: null },
    { $set: { expiresAt: new Date(Date.now() - 1000) } }
  );
  assert.equal((await request(app)
    .post('/api/v1/auth/invitation-context')
    .send({ token })).status, 400);
  assert.equal((await request(app)
    .post('/api/v1/auth/setup-password')
    .send({ token, password: '123456' })).status, 400);
  const user = await User.findById(invited.body.data.staff._id).lean();
  assert.equal(user.isSetupComplete, false);
  assert.equal(user.isActive, false);
});

test('dentist invitations require an existing unlinked profile and enforce the current link under races', async () => {
  const missing = await request(app)
    .post('/api/v1/staff/invite')
    .set(bearer(staff.adminToken))
    .send({ name: 'Missing Profile', email: 'missing-profile@example.com', role: 'dentist' });
  assert.equal(missing.status, 400);

  const unrelated = await request(app)
    .post('/api/v1/staff/invite')
    .set(bearer(staff.adminToken))
    .send({
      name: 'Reception User',
      email: 'new-reception@example.com',
      role: 'receptionist',
      dentistProfileId: String(core.secondDentist._id),
    });
  assert.equal(unrelated.status, 400);

  const payload = (suffix) => ({
    name: `Dentist Invite ${suffix}`,
    email: `dentist-invite-${suffix}@example.com`,
    role: 'dentist',
    dentistProfileId: String(core.secondDentist._id),
  });
  const results = await Promise.all([
    request(app).post('/api/v1/staff/invite').set(bearer(staff.adminToken)).send(payload('a')),
    request(app).post('/api/v1/staff/invite').set(bearer(staff.adminToken)).send(payload('b')),
  ]);
  assert.deepEqual(results.map(({ status }) => status).sort(), [201, 409]);
  assert.equal(await User.countDocuments({
    dentistProfile: core.secondDentist._id,
    deactivatedAt: null,
  }), 1);
  const created = results.find(({ status }) => status === 201).body.data.staff;
  assert.equal(created.dentistProfile, String(core.secondDentist._id));
  assert.equal(JSON.stringify(created).includes('token'), false);

  const conflictingAssignment = await request(app)
    .put(`/api/v1/staff/${created._id}/dentist-profile`)
    .set(bearer(staff.adminToken))
    .send({ dentistId: String(core.dentist._id) });
  assert.equal(conflictingAssignment.status, 409);
});

test('invitation context is non-secret, localized-profile aware, and invalid after cancellation', async () => {
  const invited = await request(app)
    .post('/api/v1/staff/invite')
    .set(bearer(staff.adminToken))
    .send({
      name: 'Context Dentist',
      email: 'context@example.com',
      role: 'dentist',
      dentistProfileId: String(core.secondDentist._id),
    });
  assert.equal(invited.status, 201);
  const token = tokenFromMail(sentMail[0]);
  const context = await request(app)
    .post('/api/v1/auth/invitation-context')
    .send({ token });
  assert.equal(context.status, 200);
  assert.equal(context.body.data.invitation.email, 'context@example.com');
  assert.equal(context.body.data.invitation.role, 'dentist');
  assert.equal(context.body.data.invitation.dentist._id, String(core.secondDentist._id));
  assert.deepEqual(
    Object.keys(context.body.data.invitation.dentist).sort(),
    ['_id', 'firstName', 'lastName', 'translations']
  );
  assert.equal(JSON.stringify(context.body.data.invitation.dentist).includes('bio'), false);
  assert.equal(JSON.stringify(context.body).includes(token), false);

  const cancelled = await request(app)
    .post(`/api/v1/staff/${invited.body.data.staff._id}/cancel-invitation`)
    .set(bearer(staff.adminToken))
    .send({});
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.data.staff.isSetupComplete, false);
  assert.ok(cancelled.body.data.staff.deactivatedAt);
  assert.equal((await request(app)
    .post('/api/v1/auth/setup-password')
    .send({ token, password: '123456' })).status, 400);
  assert.equal((await request(app)
    .post('/api/v1/auth/invitation-context')
    .send({ token })).status, 400);
});

test('concurrent invitation resends leave exactly one usable replacement token', async () => {
  const invited = await request(app)
    .post('/api/v1/staff/invite')
    .set(bearer(staff.adminToken))
    .send({ name: 'Resend Race', email: 'resend-race@example.com', role: 'receptionist' });
  assert.equal(invited.status, 201);
  const id = invited.body.data.staff._id;

  const responses = await Promise.all([
    request(app).post(`/api/v1/staff/${id}/resend-invitation`).set(bearer(staff.adminToken)).send({}),
    request(app).post(`/api/v1/staff/${id}/resend-invitation`).set(bearer(staff.adminToken)).send({}),
  ]);
  assert.deepEqual(responses.map(({ status }) => status), [200, 200]);
  assert.equal(await OneTimeToken.countDocuments({ user: id, purpose: 'invite', consumedAt: null }), 1);

  const contexts = await Promise.all(sentMail.map((mail) => request(app)
    .post('/api/v1/auth/invitation-context')
    .send({ token: tokenFromMail(mail) })));
  assert.equal(contexts.filter(({ status }) => status === 200).length, 1);
  assert.equal(contexts.filter(({ status }) => status === 400).length, 2);
});

test('invitation cancellation and setup race to one consistent terminal state', async () => {
  const invited = await request(app)
    .post('/api/v1/staff/invite')
    .set(bearer(staff.adminToken))
    .send({ name: 'Cancel Race', email: 'cancel-race@example.com', role: 'receptionist' });
  assert.equal(invited.status, 201);
  const id = invited.body.data.staff._id;
  const token = tokenFromMail(sentMail[0]);

  const [cancelled, setup] = await Promise.all([
    request(app).post(`/api/v1/staff/${id}/cancel-invitation`).set(bearer(staff.adminToken)).send({}),
    request(app).post('/api/v1/auth/setup-password').send({ token, password: '123456' }),
  ]);
  assert.equal([cancelled.status, setup.status].filter((status) => status === 200).length, 1);
  assert.ok([400, 409].includes([cancelled.status, setup.status].find((status) => status !== 200)));

  const user = await User.findById(id).lean();
  if (user.isSetupComplete) {
    assert.equal(user.isActive, true);
    assert.equal(user.deactivatedAt, null);
  }
  else {
    assert.equal(user.isActive, false);
    assert.ok(user.deactivatedAt);
  }
  assert.equal(await OneTimeToken.countDocuments({ user: id, purpose: 'invite', consumedAt: null }), 0);
});

test('invitation resend and setup race cannot reactivate an old token or corrupt lifecycle state', async () => {
  const invited = await request(app)
    .post('/api/v1/staff/invite')
    .set(bearer(staff.adminToken))
    .send({ name: 'Setup Race', email: 'setup-race@example.com', role: 'receptionist' });
  assert.equal(invited.status, 201);
  const id = invited.body.data.staff._id;
  const original = tokenFromMail(sentMail[0]);

  const [resent, setup] = await Promise.all([
    request(app).post(`/api/v1/staff/${id}/resend-invitation`).set(bearer(staff.adminToken)).send({}),
    request(app).post('/api/v1/auth/setup-password').send({ token: original, password: '123456' }),
  ]);
  assert.equal([resent.status, setup.status].filter((status) => status === 200).length, 1);
  assert.ok([400, 409].includes([resent.status, setup.status].find((status) => status !== 200)));

  const user = await User.findById(id).lean();
  assert.equal(user.deactivatedAt, null);
  assert.equal(user.isActive, user.isSetupComplete);
  assert.equal(
    await OneTimeToken.countDocuments({ user: id, purpose: 'invite', consumedAt: null }),
    user.isSetupComplete ? 0 : 1
  );
  assert.equal((await request(app)
    .post('/api/v1/auth/setup-password')
    .send({ token: original, password: 'abcdef' })).status, 400);
});

test('deactivating and restoring dentist staff preserves the independent public profile', async () => {
  const endpoint = `/api/v1/staff/${staff.dentistUser._id}`;
  const deactivated = await request(app).post(`${endpoint}/deactivate`).set(bearer(staff.adminToken));
  assert.equal(deactivated.status, 200);
  assert.equal(deactivated.body.data.staff.dentistProfile, String(core.dentist._id));
  const preserved = await core.dentist.constructor.findById(core.dentist._id).lean();
  assert.equal(preserved.isActive, true);
  assert.equal(preserved.bookingEnabled, true);
  assert.equal((await login(staff.dentistUser.email, 'correct horse battery staple')).status, 401);
  const restored = await request(app).post(`${endpoint}/reactivate`).set(bearer(staff.adminToken));
  assert.equal(restored.status, 200);
  assert.equal(restored.body.data.staff.dentistProfile, String(core.dentist._id));
  assert.equal((await login(staff.dentistUser.email, 'correct horse battery staple')).status, 200);
});

test('restoring archived dentist staff checks a newly claimed current profile and preserves history', async () => {
  const endpoint = `/api/v1/staff/${staff.dentistUser._id}`;
  assert.equal((await request(app).post(`${endpoint}/deactivate`).set(bearer(staff.adminToken))).status, 200);
  const replacement = await User.create({
    name: 'Replacement Dentist',
    email: 'replacement-dentist@example.com',
    password: '123456',
    role: 'dentist',
    dentistProfile: core.dentist._id,
  });
  const conflict = await request(app).post(`${endpoint}/reactivate`).set(bearer(staff.adminToken));
  assert.equal(conflict.status, 409);
  const archived = await User.findById(staff.dentistUser._id).select('+dentistProfile').lean();
  assert.equal(archived.isActive, false);
  assert.ok(archived.deactivatedAt);
  assert.equal(String(archived.dentistProfile), String(core.dentist._id));
  assert.equal(await User.countDocuments({ dentistProfile: core.dentist._id, deactivatedAt: null }), 1);
  assert.ok(replacement._id);
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
    .send({ role: 'dentist', dentistProfileId: String(core.secondDentist._id), isActive: true });
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

test('concurrent role changes cannot link one dentist profile to two current accounts', async () => {
  const candidates = await User.create([
    { name: 'Role Race One', email: 'role-race-one@example.com', password: '123456', role: 'receptionist' },
    { name: 'Role Race Two', email: 'role-race-two@example.com', password: '123456', role: 'receptionist' },
  ]);
  const responses = await Promise.all(candidates.map((candidate) => request(app)
    .patch(`/api/v1/staff/${candidate._id}/role`)
    .set(bearer(staff.adminToken))
    .send({ role: 'dentist', dentistProfileId: String(core.secondDentist._id) })));
  assert.deepEqual(responses.map(({ status }) => status).sort(), [200, 409]);
  assert.equal(await User.countDocuments({
    dentistProfile: core.secondDentist._id,
    deactivatedAt: null,
  }), 1);
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
