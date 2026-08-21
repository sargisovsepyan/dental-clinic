import test, {
  after,
  before,
  beforeEach,
} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';


process.env.NODE_ENV = 'test';
process.env.MONGO_URI =
  'mongodb://127.0.0.1:27017/dental_clinic_test';
process.env.JWT_SECRET =
  'test-only-secret-that-is-at-least-thirty-two-characters';
process.env.JWT_EXPIRES_IN = '15m';
process.env.REFRESH_TOKEN_TTL_DAYS = '1';
process.env.SESSION_ABSOLUTE_TTL_DAYS = '2';
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
const { default: User } = await import(
  '../src/modules/users/user.model.js'
);
const { default: Session } = await import(
  '../src/modules/sessions/session.model.js'
);
const { default: RefreshReplayHistory } = await import(
  '../src/modules/sessions/refreshReplayHistory.model.js'
);
const { default: OneTimeToken } = await import(
  '../src/modules/auth/oneTimeToken.model.js'
);
const { default: AuditLog } = await import(
  '../src/modules/audit/audit.model.js'
);
const {
  DUMMY_PASSWORD_HASH,
  FORGOT_PASSWORD_MIN_RESPONSE_MS,
  changePassword,
  compareLoginPassword,
  forgotPassword,
  issueOneTimeToken,
  login,
  logout,
  refresh,
  resetPassword,
  setupPassword,
} = await import('../src/modules/auth/auth.service.js');
const {
  deactivateStaff,
  inviteStaff,
  reactivateStaff,
} = await import('../src/modules/staff/staff.service.js');
const {
  generateRefreshToken,
  generateRefreshTokenFamilyId,
  getRefreshTokenFamilyId,
  hashToken,
} = await import('../src/utils/refreshToken.js');
const {
  setMailAdapterForTests,
  resetMailAdapterForTests,
} = await import('../src/mail/mail.service.js');
const refreshSessionMigration = await import(
  '../src/migrations/20260814_005_refresh_session_lifecycle.js'
);
const { tokenKey } = await import(
  '../src/middlewares/rateLimiter.js'
);


let staff;


before(connectReplTestDatabase);


beforeEach(async () => {
  await clearReplTestDatabase();
  staff = await seedStaff();
  setMailAdapterForTests({
    async send() {},
  });
});


after(async () => {
  resetMailAdapterForTests();
  await disconnectReplTestDatabase();
});


test('refresh idle expiry is capped by a fixed absolute session expiry', async () => {
  const signedIn = await login(
    staff.admin.email,
    'correct horse battery staple'
  );
  const familyId = getRefreshTokenFamilyId(
    signedIn.refreshToken
  );
  const created = await Session.findOne({ familyId })
    .select('+issuedAuthVersion')
    .lean();

  assert.equal(created.issuedAuthVersion, 0);
  assert.ok(created.expiresAt < created.absoluteExpiresAt);
  assert.ok(
    created.absoluteExpiresAt.getTime() - created.createdAt.getTime() <=
      2 * 24 * 60 * 60 * 1000 + 1_000
  );

  const forcedAbsoluteExpiry = new Date(Date.now() + 60_000);
  await Session.collection.updateOne(
    { _id: created._id },
    {
      $set: {
        absoluteExpiresAt: forcedAbsoluteExpiry,
        expiresAt: new Date(Date.now() + 30_000),
      },
    }
  );

  const rotated = await refresh(signedIn.refreshToken);
  const afterRotation = await Session.findById(created._id).lean();
  assert.equal(
    afterRotation.expiresAt.getTime(),
    forcedAbsoluteExpiry.getTime()
  );
  assert.equal(
    getRefreshTokenFamilyId(rotated.refreshToken),
    familyId
  );

  await Session.collection.updateOne(
    { _id: created._id },
    { $set: { expiresAt: new Date(Date.now() - 1) } }
  );
  await assert.rejects(
    () => refresh(rotated.refreshToken),
    (error) => error.statusCode === 401
  );

  const another = await login(
    staff.admin.email,
    'correct horse battery staple'
  );
  await Session.collection.updateOne(
    { tokenHash: hashToken(another.refreshToken) },
    {
      $set: {
        absoluteExpiresAt: new Date(Date.now() - 1),
      },
    }
  );
  await assert.rejects(
    () => refresh(another.refreshToken),
    (error) => error.statusCode === 401
  );
});


test('many rotations keep the session bounded and replay invalidation is once per family', async () => {
  const firstLogin = await login(
    staff.admin.email,
    'correct horse battery staple'
  );
  const firstToken = firstLogin.refreshToken;
  const familyId = getRefreshTokenFamilyId(firstToken);
  let currentToken = firstToken;

  for (let rotation = 0; rotation < 40; rotation += 1) {
    currentToken = (await refresh(currentToken)).refreshToken;
  }

  const rawSession = await Session.collection.findOne({ familyId });
  assert.equal(rawSession.consumedTokenHashes, undefined);
  assert.equal(
    await RefreshReplayHistory.countDocuments({ familyId }),
    40
  );

  const replayAttempts = await Promise.allSettled(
    Array.from({ length: 5 }, () => refresh(firstToken))
  );
  assert.equal(
    replayAttempts.every(({ status, reason }) => (
      status === 'rejected' && reason.statusCode === 401
    )),
    true
  );
  const versionAfterFirstReplay = (
    await User.findById(staff.admin._id)
      .select('+authVersion')
      .lean()
  ).authVersion;
  assert.equal(versionAfterFirstReplay, 1);

  const newLogin = await login(
    staff.admin.email,
    'correct horse battery staple'
  );
  await assert.rejects(
    () => refresh(firstToken),
    (error) => error.statusCode === 401
  );
  const afterRepeatedReplay = await User.findById(staff.admin._id)
    .select('+authVersion')
    .lean();
  assert.equal(
    afterRepeatedReplay.authVersion,
    versionAfterFirstReplay
  );

  const newSession = await Session.findOne({
    tokenHash: hashToken(newLogin.refreshToken),
  }).lean();
  assert.equal(newSession.revokedAt, null);
  assert.ok((await refresh(newLogin.refreshToken)).accessToken);
});


test('replay after logout or a password security change has no further side effects', async () => {
  const request = {
    id: 'replay-after-revocation',
    method: 'POST',
    path: '/api/v1/auth/refresh',
    ip: '127.0.0.1',
    get: () => 'test-agent',
  };

  const loggedOutLogin = await login(
    staff.admin.email,
    'correct horse battery staple'
  );
  const loggedOutOldToken = loggedOutLogin.refreshToken;
  const loggedOutCurrentToken = (
    await refresh(loggedOutOldToken)
  ).refreshToken;
  await logout(loggedOutCurrentToken);

  const versionBeforeLogoutReplay = (
    await User.findById(staff.admin._id)
      .select('+authVersion')
      .lean()
  ).authVersion;
  await assert.rejects(
    () => refresh(loggedOutOldToken, request),
    (error) => error.statusCode === 401
  );
  assert.equal(
    (
      await User.findById(staff.admin._id)
        .select('+authVersion')
        .lean()
    ).authVersion,
    versionBeforeLogoutReplay
  );

  const changedLogin = await login(
    staff.receptionist.email,
    'correct horse battery staple'
  );
  const changedOldToken = changedLogin.refreshToken;
  await refresh(changedOldToken);
  await changePassword(
    staff.receptionist._id,
    'correct horse battery staple',
    'new secure password'
  );
  const versionAfterPasswordChange = (
    await User.findById(staff.receptionist._id)
      .select('+authVersion')
      .lean()
  ).authVersion;

  await assert.rejects(
    () => refresh(changedOldToken, request),
    (error) => error.statusCode === 401
  );
  assert.equal(
    (
      await User.findById(staff.receptionist._id)
        .select('+authVersion')
        .lean()
    ).authVersion,
    versionAfterPasswordChange
  );
  assert.equal(
    await AuditLog.countDocuments({
      action: 'auth.refresh.reuse_detected',
    }),
    0
  );
});


test('a refresh session cannot upgrade itself across an authVersion change', async () => {
  const signedIn = await login(
    staff.receptionist.email,
    'correct horse battery staple'
  );
  await User.updateOne(
    { _id: staff.receptionist._id },
    { $inc: { authVersion: 1 } }
  );

  await assert.rejects(
    () => refresh(signedIn.refreshToken),
    (error) => error.statusCode === 401
  );
  const stored = await Session.findOne({
    tokenHash: hashToken(signedIn.refreshToken),
  }).lean();
  assert.ok(stored.revokedAt instanceof Date);
});


test('legacy refresh migration is dry-run safe, idempotent, and revokes unverifiable trust', async () => {
  const now = new Date();
  const consumedHashes = ['a'.repeat(64), 'b'.repeat(64)];
  const legacyId = (
    await Session.collection.insertOne({
      user: staff.receptionist._id,
      tokenHash: 'c'.repeat(64),
      consumedTokenHashes: consumedHashes,
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      revokedAt: null,
      userAgent: '',
      createdAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      updatedAt: now,
    })
  ).insertedId;

  const dryRun = await refreshSessionMigration.run({ dryRun: true });
  assert.equal(dryRun.sessionsScanned, 1);
  assert.equal(dryRun.sessionsRevoked, 1);
  assert.equal(dryRun.replayHashesCopied, 2);
  assert.ok(
    (await Session.collection.findOne({ _id: legacyId }))
      .consumedTokenHashes
  );

  const applied = await refreshSessionMigration.run({ dryRun: false });
  const rerun = await refreshSessionMigration.run({ dryRun: false });
  assert.equal(applied.sessionsScanned, 1);
  assert.equal(rerun.sessionsScanned, 0);

  const migrated = await Session.collection.findOne({ _id: legacyId });
  assert.ok(migrated.revokedAt instanceof Date);
  assert.equal(migrated.issuedAuthVersion, 0);
  assert.ok(migrated.absoluteExpiresAt instanceof Date);
  assert.equal(migrated.consumedTokenHashes, undefined);
  assert.equal(
    await RefreshReplayHistory.countDocuments({
      familyId: migrated.familyId,
    }),
    2
  );
});

test('legacy refresh migration chunks replay history and safely resumes partial work', async () => {
  const now = new Date();
  const consumedTokenHashes = Array.from(
    { length: 501 },
    (_, index) => crypto
      .createHash('sha256')
      .update(`legacy-replay-${index}`)
      .digest('hex')
  );
  const legacyId = (
    await Session.collection.insertOne({
      user: staff.receptionist._id,
      tokenHash: 'd'.repeat(64),
      consumedTokenHashes,
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      revokedAt: null,
      createdAt: now,
      updatedAt: now,
    })
  ).insertedId;
  let chunks = 0;

  await assert.rejects(
    refreshSessionMigration.run({
      dryRun: false,
      afterReplayChunk: async () => {
        chunks += 1;
        if (chunks === 1) throw new Error('injected chunk interruption');
      },
    }),
    /injected chunk interruption/
  );
  assert.equal(
    (await Session.collection.findOne({ _id: legacyId }))
      .consumedTokenHashes.length,
    501
  );
  assert.equal(await RefreshReplayHistory.countDocuments(), 250);

  await refreshSessionMigration.run({ dryRun: false });
  const migrated = await Session.collection.findOne({ _id: legacyId });
  assert.equal(migrated.consumedTokenHashes, undefined);
  assert.equal(migrated.familyId, `legacy-${legacyId}`);
  assert.equal(await RefreshReplayHistory.countDocuments(), 501);
});

test('legacy refresh migration fails closed on a concurrent session mutation', async () => {
  const now = new Date();
  const legacyId = (
    await Session.collection.insertOne({
      user: staff.receptionist._id,
      tokenHash: 'e'.repeat(64),
      consumedTokenHashes: ['f'.repeat(64)],
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      revokedAt: null,
      createdAt: now,
      updatedAt: now,
    })
  ).insertedId;

  await assert.rejects(
    refreshSessionMigration.run({
      dryRun: false,
      beforeSessionWrite: async (legacy) => {
        if (String(legacy._id) !== String(legacyId)) return;
        await Session.collection.updateOne(
          { _id: legacyId },
          {
            $set: {
              tokenHash: '1'.repeat(64),
              updatedAt: new Date(now.getTime() + 1_000),
            },
          }
        );
      },
    }),
    /changed while its legacy replay state was migrated/
  );
  const preserved = await Session.collection.findOne({ _id: legacyId });
  assert.equal(preserved.tokenHash, '1'.repeat(64));
  assert.deepEqual(preserved.consumedTokenHashes, ['f'.repeat(64)]);
});


test('deactivation cancels pending invitations and reset tokens even for inactive users', async () => {
  const pending = await User.create({
    name: 'Pending Invitation',
    email: 'pending@example.com',
    role: 'dentist',
    isActive: false,
    isSetupComplete: false,
    invitedBy: staff.admin._id,
  });
  const inviteToken = await issueOneTimeToken({
    user: pending,
    purpose: 'invite',
    createdBy: staff.admin._id,
    ttlMinutes: 60,
  });

  await deactivateStaff(pending._id, staff.admin._id);
  await assert.rejects(
    () => setupPassword(inviteToken, '123456'),
    (error) => error.statusCode === 400
  );
  const stillPending = await User.findById(pending._id).lean();
  assert.equal(stillPending.isActive, false);
  assert.equal(stillPending.isSetupComplete, false);

  const resetToken = await issueOneTimeToken({
    user: staff.receptionist,
    purpose: 'password_reset',
    ttlMinutes: 60,
  });
  await deactivateStaff(staff.receptionist._id, staff.admin._id);
  const firstDeactivation = await User.findById(staff.receptionist._id)
    .select('+authVersion')
    .lean();
  const tokenIssuedWhileInactive = await issueOneTimeToken({
    user: firstDeactivation,
    purpose: 'password_reset',
    ttlMinutes: 60,
  });
  await deactivateStaff(staff.receptionist._id, staff.admin._id);
  const repeatedDeactivation = await User.findById(
    staff.receptionist._id
  )
    .select('+authVersion')
    .lean();
  assert.equal(
    repeatedDeactivation.authVersion,
    firstDeactivation.authVersion
  );
  assert.equal(
    repeatedDeactivation.deactivatedAt.getTime(),
    firstDeactivation.deactivatedAt.getTime()
  );
  await reactivateStaff(staff.receptionist._id);
  for (const cancelledToken of [
    resetToken,
    tokenIssuedWhileInactive,
  ]) {
    await assert.rejects(
      () => resetPassword(cancelledToken, 'abcdef'),
      (error) => error.statusCode === 400
    );
  }
  assert.equal(
    await OneTimeToken.countDocuments({ consumedAt: null }),
    0
  );
});


test('an invite token persisted after deactivation cannot reactivate the pending account', async () => {
  const pending = await User.create({
    name: 'Concurrent Pending Invitation',
    email: 'concurrent-pending@example.com',
    role: 'dentist',
    isActive: false,
    isSetupComplete: false,
    invitedBy: staff.admin._id,
  });
  let releasePersistence;
  const persistenceBlocked = new Promise((resolve) => {
    releasePersistence = resolve;
  });
  let persistencePaused;
  const paused = new Promise((resolve) => {
    persistencePaused = resolve;
  });

  const issuing = issueOneTimeToken({
    user: pending,
    purpose: 'invite',
    createdBy: staff.admin._id,
    ttlMinutes: 60,
    beforePersist: async () => {
      persistencePaused();
      await persistenceBlocked;
    },
  });
  await paused;
  await deactivateStaff(pending._id, staff.admin._id);
  releasePersistence();
  const racedToken = await issuing;

  await assert.rejects(
    () => setupPassword(racedToken, '123456'),
    (error) => error.statusCode === 400
  );
  const afterRace = await User.findById(pending._id).lean();
  assert.equal(afterRace.isActive, false);
  assert.equal(afterRace.isSetupComplete, false);
  assert.ok(afterRace.deactivatedAt instanceof Date);

  let reinviteToken;
  setMailAdapterForTests({
    async send(message) {
      const link = new URL(message.text.split(': ').at(-1));
      reinviteToken = new URLSearchParams(
        link.hash.slice(1)
      ).get('token');
    },
  });
  await inviteStaff({
    name: pending.name,
    email: pending.email,
    role: pending.role,
  }, staff.admin._id);
  assert.ok(reinviteToken);
  assert.equal(
    (await User.findById(pending._id).lean()).deactivatedAt,
    null
  );
  assert.equal(
    (await setupPassword(reinviteToken, '123456')).isActive,
    true
  );
});


test('unknown login performs the same bcrypt comparison abstraction', async () => {
  const calls = [];
  const accepted = await compareLoginPassword(
    null,
    'not-the-password',
    async (password, hash) => {
      calls.push({ password, hash });
      return false;
    }
  );

  assert.equal(accepted, false);
  assert.deepEqual(calls, [{
    password: 'not-the-password',
    hash: DUMMY_PASSWORD_HASH,
  }]);
});


test('forgot-password applies the same response floor without awaiting SMTP', async () => {
  let deliveryStarted;
  const started = new Promise((resolve) => {
    deliveryStarted = resolve;
  });
  let releaseDelivery;
  const blockedDelivery = new Promise((resolve) => {
    releaseDelivery = resolve;
  });
  setMailAdapterForTests({
    async send() {
      deliveryStarted();
      await blockedDelivery;
    },
  });

  const floorWaits = [];
  const exercise = async (email) => {
    let releaseFloor;
    const floorBlocked = new Promise((resolve) => {
      releaseFloor = resolve;
    });
    let floorStarted;
    const atFloor = new Promise((resolve) => {
      floorStarted = resolve;
    });
    let completed = false;
    const operation = forgotPassword(email, {
      now: () => 1_000,
      wait: async (milliseconds) => {
        floorWaits.push(milliseconds);
        floorStarted();
        await floorBlocked;
      },
    }).then(() => {
      completed = true;
    });

    await atFloor;
    assert.equal(completed, false);
    releaseFloor();
    await operation;
    assert.equal(completed, true);
  };

  try {
    const known = exercise(staff.admin.email);
    await started;
    await known;
    assert.deepEqual(floorWaits, [
      FORGOT_PASSWORD_MIN_RESPONSE_MS,
    ]);

    await exercise('unknown@example.com');
    assert.deepEqual(floorWaits, [
      FORGOT_PASSWORD_MIN_RESPONSE_MS,
      FORGOT_PASSWORD_MIN_RESPONSE_MS,
    ]);
  }
  finally {
    releaseDelivery();
  }
  await new Promise((resolve) => setImmediate(resolve));
});


test('refresh limiter key remains stable across family rotations', () => {
  const familyId = generateRefreshTokenFamilyId();
  const first = generateRefreshToken(familyId);
  const second = generateRefreshToken(familyId);
  const another = generateRefreshToken();

  const keyFor = (token) => tokenKey({
    body: {},
    cookies: { refresh_token: token },
    ip: '127.0.0.1',
  });

  assert.equal(keyFor(first), keyFor(second));
  assert.notEqual(keyFor(first), keyFor(another));
});
