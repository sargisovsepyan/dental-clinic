import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/dental_clinic_test';
process.env.JWT_SECRET = 'test-only-secret-that-is-at-least-thirty-two-characters';
process.env.CLIENT_URL = 'http://localhost:5173';

const {
  connectTestDatabase,
  clearTestDatabase,
  disconnectTestDatabase,
} = await import('../test-support/database.js');
const { default: Migration } = await import(
  '../src/modules/migrations/migration.model.js'
);
const {
  ensureMigrationPrerequisiteIndexes,
  migrationManifest,
  migrationChecksum,
  runMigrations,
} = await import('../src/migrations/runner.js');
const { verifyMigrationLedger } = await import(
  '../src/production/preflight.service.js'
);

before(async () => {
  await connectTestDatabase();
  await Migration.init();
});

beforeEach(clearTestDatabase);
after(disconnectTestDatabase);

const migration = (overrides = {}) => ({
  version: 'test_001',
  description: 'Test migration',
  run: async () => ({ changed: 1 }),
  ...overrides,
});

test('migration runner dry-runs without ledger writes and applies once', async () => {
  let calls = 0;
  const candidate = migration({
    run: async ({ dryRun }) => {
      calls += 1;
      return { dryRun };
    },
  });

  assert.equal(
    (await runMigrations({ dryRun: true, migrationSet: [candidate] }))[0]
      .status,
    'dry_run'
  );
  assert.equal(await Migration.countDocuments(), 0);

  assert.equal(
    (await runMigrations({
      dryRun: false,
      migrationSet: [candidate],
      releaseArtifact: 'commit-abcdef1234567890',
    }))[0]
      .status,
    'applied'
  );
  assert.equal(
    (await runMigrations({ dryRun: false, migrationSet: [candidate] }))[0]
      .status,
    'already_applied'
  );
  assert.equal(calls, 2);

  const record = await Migration.findOne({ version: candidate.version }).lean();
  assert.equal(record.state, 'applied');
  assert.equal(record.attempts, 1);
  assert.equal(record.checksum, migrationChecksum(candidate));
  assert.ok(record.appliedAt instanceof Date);
  assert.equal(record.ownerToken, undefined);
  assert.equal(record.leaseExpiresAt, undefined);
  assert.equal(record.metadata.releaseArtifact, 'commit-abcdef1234567890');
});

test('migration runner records partial failure and safely retries it', async () => {
  let attempts = 0;
  const candidate = migration({
    version: 'test_002',
    run: async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error([
          'mongodb://operator:',
          'super-secret',
          '@example.test/db',
        ].join(''));
      }
      return { recovered: true };
    },
  });

  await assert.rejects(
    runMigrations({ dryRun: false, migrationSet: [candidate] }),
    /super-secret/
  );
  const failed = await Migration.findOne({ version: candidate.version }).lean();
  assert.equal(failed.state, 'failed');
  assert.equal(failed.attempts, 1);
  assert.equal(failed.lastFailure, 'Error: execution failed');
  assert.doesNotMatch(failed.lastFailure, /super-secret/);

  const result = await runMigrations({
    dryRun: false,
    migrationSet: [candidate],
  });
  assert.equal(result[0].status, 'applied');
  const applied = await Migration.findOne({ version: candidate.version }).lean();
  assert.equal(applied.state, 'applied');
  assert.equal(applied.attempts, 2);
  assert.equal(applied.lastFailure, undefined);
});

test('only one concurrent operator can own a migration lease', async () => {
  let release;
  let started;
  const startedPromise = new Promise((resolve) => { started = resolve; });
  const blocked = new Promise((resolve) => { release = resolve; });
  const candidate = migration({
    version: 'test_003',
    run: async () => {
      started();
      await blocked;
      return { changed: 1 };
    },
  });

  const owner = runMigrations({ dryRun: false, migrationSet: [candidate] });
  await startedPromise;
  await assert.rejects(
    runMigrations({ dryRun: false, migrationSet: [candidate] }),
    /active lease/
  );
  release();
  assert.equal((await owner)[0].status, 'applied');
});

test('apply bootstraps unique migration indexes before the first concurrent claim', async () => {
  for (const name of [
    'migrations',
    'refreshreplayhistories',
    'bookingidempotencies',
  ]) {
    await Migration.db.db.dropCollection(name).catch((error) => {
      if (error?.code !== 26 && error?.codeName !== 'NamespaceNotFound') {
        throw error;
      }
    });
  }

  const dryCandidate = migration({ version: 'test_fresh_dry_run' });
  await runMigrations({ dryRun: true, migrationSet: [dryCandidate] });
  const afterDryRun = await Migration.db.db
    .listCollections({}, { nameOnly: true })
    .toArray();
  assert.equal(
    afterDryRun.some(({ name }) => [
      'migrations',
      'refreshreplayhistories',
      'bookingidempotencies',
    ].includes(name)),
    false
  );

  let release;
  let started;
  let executions = 0;
  const startedPromise = new Promise((resolve) => { started = resolve; });
  const blocked = new Promise((resolve) => { release = resolve; });
  const candidate = migration({
    version: 'test_fresh_apply',
    run: async () => {
      executions += 1;
      started();
      await blocked;
      return { changed: 1 };
    },
  });

  const first = runMigrations({ dryRun: false, migrationSet: [candidate] });
  await startedPromise;
  await assert.rejects(
    runMigrations({ dryRun: false, migrationSet: [candidate] }),
    /active lease/
  );
  release();
  assert.equal((await first)[0].status, 'applied');
  assert.equal(executions, 1);
  assert.equal(
    await Migration.collection.countDocuments({ version: candidate.version }),
    1
  );

  for (const [collectionName, field] of [
    ['migrations', 'version'],
    ['refreshreplayhistories', 'tokenHash'],
    ['bookingidempotencies', 'keyHash'],
  ]) {
    const index = (await Migration.db.db
      .collection(collectionName)
      .listIndexes()
      .toArray())
      .find((candidateIndex) => candidateIndex.key[field] === 1);
    assert.equal(index?.unique, true);
  }
  const bookingTtl = (await Migration.db.db
    .collection('bookingidempotencies')
    .listIndexes()
    .toArray())
    .find((candidateIndex) => candidateIndex.key.expiresAt === 1);
  assert.equal(Number(bookingTtl?.expireAfterSeconds), 0);
});

test('apply rejects a partial unique ledger index before executing migration code', async () => {
  await Migration.db.db.dropCollection('migrations').catch((error) => {
    if (error?.code !== 26 && error?.codeName !== 'NamespaceNotFound') {
      throw error;
    }
  });
  await Migration.collection.createIndex(
    { version: 1 },
    {
      unique: true,
      partialFilterExpression: { state: 'applied' },
    }
  );
  let executed = false;
  const candidate = migration({
    version: 'test_partial_ledger_index',
    run: async () => {
      executed = true;
      return { changed: 1 };
    },
  });

  try {
    await assert.rejects(
      runMigrations({ dryRun: false, migrationSet: [candidate] }),
      /prerequisite index.*unsafe options/
    );
    assert.equal(executed, false);
    assert.equal(await Migration.collection.countDocuments(), 0);
  }
  finally {
    await Migration.db.db.dropCollection('migrations');
    await ensureMigrationPrerequisiteIndexes();
  }
});

test('apply rejects an unsafe booking-idempotency TTL before migration code', async () => {
  const collection = Migration.db.db.collection('bookingidempotencies');
  await collection.dropIndex('expiresAt_1');
  await collection.createIndex(
    { expiresAt: 1 },
    { expireAfterSeconds: 60 }
  );
  let executed = false;
  const candidate = migration({
    version: 'test_unsafe_booking_ttl',
    run: async () => {
      executed = true;
      return { changed: 1 };
    },
  });

  try {
    await assert.rejects(
      runMigrations({ dryRun: false, migrationSet: [candidate] }),
      /prerequisite index.*unsafe options/
    );
    assert.equal(executed, false);
    assert.equal(await Migration.countDocuments(), 0);
  }
  finally {
    await collection.dropIndex('expiresAt_1');
    await ensureMigrationPrerequisiteIndexes();
  }
});

test('a runner that loses its lease cannot mark the migration applied', async () => {
  let release;
  let started;
  const startedPromise = new Promise((resolve) => { started = resolve; });
  const blocked = new Promise((resolve) => { release = resolve; });
  const candidate = migration({
    version: 'test_lease_loss',
    run: async () => {
      started();
      await blocked;
      return { changed: 1 };
    },
  });

  const running = runMigrations({
    dryRun: false,
    migrationSet: [candidate],
    leaseMs: 60_000,
  });
  await startedPromise;
  await Migration.collection.updateOne(
    { version: candidate.version },
    {
      $set: {
        ownerToken: 'replacement-owner',
        leaseExpiresAt: new Date(Date.now() + 60_000),
      },
    }
  );
  release();

  await assert.rejects(running, /lost its execution lease/);
  const record = await Migration.collection.findOne({
    version: candidate.version,
  });
  assert.equal(record.state, 'running');
  assert.equal(record.ownerToken, 'replacement-owner');
  assert.equal(record.appliedAt, undefined);
});

test('lease assertions wait for an in-flight heartbeat before migration code proceeds', async () => {
  const originalUpdateOne = Migration.updateOne;
  let heartbeatCalls = 0;
  let heartbeatBlocked;
  let releaseHeartbeat;
  let startLeaseAssertion;
  let migrationStarted;
  let passedLeaseAssertion = false;
  const heartbeatReached = new Promise((resolve) => {
    heartbeatBlocked = resolve;
  });
  const heartbeatReleased = new Promise((resolve) => {
    releaseHeartbeat = resolve;
  });
  const leaseAssertionRequested = new Promise((resolve) => {
    startLeaseAssertion = resolve;
  });
  const started = new Promise((resolve) => {
    migrationStarted = resolve;
  });

  Migration.updateOne = async function (filter, update, options) {
    const isHeartbeat =
      filter?.state === 'running' &&
      typeof filter?.ownerToken === 'string' &&
      update?.$set?.leaseExpiresAt instanceof Date;
    if (isHeartbeat) {
      heartbeatCalls += 1;
      if (heartbeatCalls === 2) {
        heartbeatBlocked();
        await heartbeatReleased;
      }
    }
    return originalUpdateOne.call(this, filter, update, options);
  };

  const candidate = migration({
    version: 'test_in_flight_heartbeat',
    run: async ({ assertLease }) => {
      migrationStarted();
      await leaseAssertionRequested;
      await assertLease();
      passedLeaseAssertion = true;
      return { changed: 1 };
    },
  });

  try {
    const running = runMigrations({
      dryRun: false,
      migrationSet: [candidate],
      leaseMs: 90,
    });
    await started;
    await heartbeatReached;
    await Migration.collection.updateOne(
      { version: candidate.version },
      {
        $set: {
          ownerToken: 'replacement-owner',
          leaseExpiresAt: new Date(Date.now() + 60_000),
        },
      }
    );
    startLeaseAssertion();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(passedLeaseAssertion, false);
    releaseHeartbeat();
    await assert.rejects(running, /lost its execution lease/);
    assert.equal(passedLeaseAssertion, false);
  }
  finally {
    releaseHeartbeat?.();
    startLeaseAssertion?.();
    Migration.updateOne = originalUpdateOne;
  }
});

test('migration checksums reject edited applied code', async () => {
  const original = migration({ version: 'test_004' });
  await runMigrations({ dryRun: false, migrationSet: [original] });

  const edited = migration({
    version: original.version,
    run: async () => ({ changed: 2 }),
  });
  await assert.rejects(
    runMigrations({ dryRun: true, migrationSet: [edited] }),
    /checksum differs/
  );
});

test('legacy applied ledger rows require evidence-backed explicit attestation', async () => {
  const candidate = migration({ version: 'test_005' });
  const originalAppliedAt = new Date(Date.now() - 60_000);
  await Migration.collection.insertOne({
    version: candidate.version,
    description: candidate.description,
    appliedAt: originalAppliedAt,
  });

  assert.equal(
    (await runMigrations({ dryRun: true, migrationSet: [candidate] }))[0]
      .status,
    'ledger_attestation_required'
  );
  await assert.rejects(
    runMigrations({ dryRun: false, migrationSet: [candidate] }),
    /requires explicit legacy ledger attestation/
  );

  const result = await runMigrations({
    dryRun: false,
    migrationSet: [candidate],
    legacyLedgerAttestations: {
      [candidate.version]: {
        actor: 'release-operator',
        artifact: 'commit-1234567890abcdef',
      },
    },
  });
  assert.equal(result[0].ledgerAttested, true);
  const record = await Migration.collection.findOne({
    version: candidate.version,
  });
  assert.equal(record.checksum, migrationChecksum(candidate));
  assert.equal(record.state, 'applied');
  assert.equal(record.appliedAt.getTime(), originalAppliedAt.getTime());
  assert.equal(record.attempts, 0);
  assert.equal(
    record.metadata.legacyLedgerAttestation.actor,
    'release-operator'
  );
  assert.equal(
    record.metadata.legacyLedgerAttestation.artifact,
    'commit-1234567890abcdef'
  );
  assert.ok(
    record.metadata.legacyLedgerAttestation.attestedAt instanceof Date
  );
});

test('null, empty, and evidence-free legacy ledger states are rejected', async () => {
  for (const [index, state] of [null, ''].entries()) {
    const candidate = migration({ version: `test_corrupt_${index}` });
    await Migration.collection.insertOne({
      version: candidate.version,
      description: candidate.description,
      state,
      appliedAt: new Date(),
    });
    await assert.rejects(
      runMigrations({ dryRun: true, migrationSet: [candidate] }),
      /invalid ledger state/
    );
  }

  const candidate = migration({ version: 'test_missing_evidence' });
  await Migration.collection.insertOne({
    version: candidate.version,
    description: candidate.description,
  });
  await assert.rejects(
    runMigrations({ dryRun: true, migrationSet: [candidate] }),
    /invalid ledger state/
  );
});

test('production preflight rejects incomplete, unknown, and altered ledger rows', async () => {
  const result = await verifyMigrationLedger();
  assert.equal(result.ok, false);
  assert.ok(result.missing.length > 0);

  await Migration.create({
    version: 'unknown_001',
    description: 'Unknown migration',
    checksum: 'a'.repeat(64),
    state: 'failed',
    lastFailure: 'Error: execution failed',
  });
  const withUnknown = await verifyMigrationLedger();
  assert.deepEqual(withUnknown.unexpected, ['unknown_001']);
  assert.equal(withUnknown.ok, false);

  await Migration.deleteMany({});
  const expected = migrationManifest[0];
  await Migration.collection.insertOne({
    version: expected.version,
    description: expected.description,
    checksum: expected.checksum,
    state: 'applied',
    attempts: 1,
    ownerToken: 'stale-owner',
  });
  const inconsistent = await verifyMigrationLedger();
  assert.ok(inconsistent.inconsistent.some(({ version, issue }) => (
    version === expected.version && issue === 'applied_at_missing'
  )));
  assert.ok(inconsistent.inconsistent.some(({ version, issue }) => (
    version === expected.version && issue === 'residual_owner'
  )));
  assert.equal(inconsistent.ok, false);
});
