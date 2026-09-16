import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { spawnSync } from 'node:child_process';

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/dental_clinic_test';
process.env.JWT_SECRET = 'test-only-secret-that-is-at-least-thirty-two-characters';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.NOTIFICATIONS_ENABLED = 'true';
process.env.CLINIC_NOTIFICATION_EMAIL = 'reception@example.test';

const { validateEnvironment } = await import('../src/config/env.js');
const { productionEnvironment } = await import('../test-support/productionEnvironment.js');
const { checkStartupPrerequisites } = await import('../src/production/startup.js');
const { assertReleaseEndpoints } = await import('../src/production/releaseConfig.js');
const { createShutdownHandler } = await import('../src/infrastructure/processLifecycle.js');
const { startNotificationWorker } = await import('../src/scripts/notificationWorker.js');
const { safeRequestPath } = await import('../src/observability/logger.js');
const { createReadinessChecker } = await import('../src/infrastructure/readiness.js');
const { createNotificationWorker } = await import('../src/modules/notifications/notificationWorker.service.js');
const { createRedisRateLimitStore } = await import('../src/middlewares/rateLimiter.js');
const { verifyMigrationLedger } = await import('../src/production/preflight.service.js');
const { migrationManifest } = await import('../src/migrations/runner.js');
const { default: Migration } = await import('../src/modules/migrations/migration.model.js');
const { closeRedis, setRedisClientForTests, resetRedisClientForTests, sendRedisCommand } = await import('../src/infrastructure/redis.js');

test('production accepts verified TLS multi-host MongoDB URIs without connecting', () => {
  const config = validateEnvironment(productionEnvironment({
    MONGO_URI: 'mongodb://db-a.example.test:27017,db-b.example.test:27017/dental_clinic?tls=true&replicaSet=clinic',
  }));
  assert.equal(config.REDIS_COMMAND_TIMEOUT_MS, 2000);
});

test('production rejects unsafe TLS, local/test targets, broad proxy trust and provider URLs', () => {
  const cases = [
    { MONGO_URI: 'mongodb+srv://cluster.example/clinic?tls=false' },
    { MONGO_URI: 'mongodb+srv://cluster.example/clinic?tlsInsecure=true' },
    { MONGO_URI: 'mongodb://db.example/clinic?tls=true&tlsAllowInvalidCertificates=true' },
    { MONGO_URI: 'mongodb://127.0.0.1/clinic?tls=true' },
    { MONGO_URI: 'mongodb://0.0.0.0/clinic?tls=true' },
    { MONGO_URI: 'mongodb://[::ffff:127.0.0.1]/clinic?tls=true' },
    { MONGO_URI: 'mongodb+srv://cluster.example/dental_clinic_test' },
    { TRUST_PROXY_CIDRS: '0.0.0.0/0' }, { TRUST_PROXY_CIDRS: '::/0' },
    { DEBUG: 'express-rate-limit:*' }, { NODE_DEBUG: 'http' }, { NODE_OPTIONS: '--inspect' },
    { REFRESH_COOKIE_SAME_SITE: 'none' }, { REFRESH_COOKIE_SAME_SITE: 'lax' },
    { CLIENT_URL: 'https://localhost', CORS_ORIGINS: 'https://localhost' },
    { REDIS_URL: `${productionEnvironment().REDIS_URL}?tls=false` },
    { SMTP_HOST: 'https://user:password@smtp.example.test' },
    { SMTP_PASSWORD: 'replace-me' }, { CLOUDINARY_API_SECRET: 'placeholder' },
    { ERROR_MONITOR_WEBHOOK_URL: 'https://user:private@monitor.example.test/report' },
    { ERROR_MONITOR_WEBHOOK_URL: 'https://monitor.example.test/report?token=private' },
  ];
  for (const config of cases) assert.throws(() => validateEnvironment(productionEnvironment(config)), JSON.stringify(config));
});

test('invalid schema diagnostics never echo configured values', () => {
  assert.throws(() => validateEnvironment(productionEnvironment({ PORT: 'private-sensitive-value' })),
    (error) => error.message.includes('PORT') && !error.message.includes('private-sensitive-value'));
});

test('preflight ledger diagnostics redact malformed historical version/state values', async () => {
  const original = Migration.collection.find;
  Migration.collection.find = () => ({ toArray: async () => [
    { version: 'private-sensitive-version' },
    { ...migrationManifest[0], state: 'private-sensitive-state', attempts: 0 },
  ] });
  try {
    const report = await verifyMigrationLedger();
    assert.equal(report.ok, false);
    assert.equal(JSON.stringify(report).includes('private-sensitive'), false);
    assert.deepEqual(report.unexpected, ['[unexpected_version]']);
    assert.equal(report.incomplete[0].state, 'invalid');
  } finally { Migration.collection.find = original; }
});

test('production release rejects fixture endpoints before connecting; config-only fixtures remain supported', () => {
  assert.throws(() => assertReleaseEndpoints(validateEnvironment(productionEnvironment())), /reserved/);
  const result = spawnSync(process.execPath, ['src/scripts/productionPreflight.js'], {
    cwd: process.cwd(), env: { ...process.env, ...productionEnvironment() }, encoding: 'utf8', timeout: 5000,
  });
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).stage, 'release_endpoints');
  assert.equal(result.stderr, '');
});

test('actual production HTTP boundaries reject untrusted forwarding and expose minimal health/errors/logs', () => {
  for (const trusted of [true, false]) {
    const result = spawnSync(process.execPath, ['test-support/productionTransportCheck.js', ...(trusted ? ['--trusted'] : [])], {
      cwd: process.cwd(), env: { ...process.env, ...productionEnvironment({ TRUST_PROXY_CIDRS: trusted ? 'loopback' : '10.0.0.0/8' }) },
      encoding: 'utf8', timeout: 15000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes('transport_passed'));
    assert.equal(result.stdout.includes('private-sensitive-value'), false);
    assert.equal(result.stdout.includes(productionEnvironment().JWT_SECRET), false);
    assert.ok(result.stdout.includes('processRole'));
  }
});

test('config-only preflight is provider-free, safe-output and fail-closed', () => {
  for (const [overrides, status] of [[{}, 0], [{ JWT_SECRET: 'private-sensitive-value' }, 1], [{ NODE_ENV: 'test' }, 1]]) {
    const result = spawnSync(process.execPath, ['src/scripts/productionPreflight.js', '--config-only'], {
      cwd: process.cwd(), env: { ...process.env, ...productionEnvironment(overrides) }, encoding: 'utf8', timeout: 5000,
    });
    assert.equal(result.status, status, result.stderr);
    assert.equal(JSON.parse(result.stdout).ok, status === 0);
    assert.equal(result.stderr, '');
    assert.equal(result.stdout.includes('private-sensitive-value'), false);
    assert.equal(result.stdout.includes('mongodb'), false);
  }
});

const prerequisites = (overrides = {}) => ({
  environment: productionEnvironment(), connection: { readyState: 1, db: {}, name: 'dental_clinic' },
  topologyCheck: async () => ({ ok: true }), indexCheck: async () => [], migrationCheck: async () => ({ ok: true }),
  ...overrides,
});

test('startup gate checks identity, transaction support, indexes and migrations without writes', async () => {
  await checkStartupPrerequisites(prerequisites());
  for (const overrides of [
    { connection: { readyState: 0 } },
    { connection: { readyState: 1, db: {}, name: 'wrong' } },
    { topologyCheck: async () => ({ ok: false }) },
    { indexCheck: async () => [{ issue: 'index_missing' }] },
    { migrationCheck: async () => ({ ok: false }) },
  ]) await assert.rejects(checkStartupPrerequisites(prerequisites(overrides)));
  await assert.rejects(checkStartupPrerequisites(prerequisites({
    timeoutMs: 10, topologyCheck: () => new Promise(() => {}),
  })), /timed out/);
});

test('readiness has a wall-clock deadline and a late success cannot poison cached failure', async () => {
  let resolve;
  const check = createReadinessChecker({ timeoutMs: 10, failureCacheMs: 100,
    mongoProbe: () => new Promise((done) => { resolve = done; }), redisProbe: async () => true });
  assert.deepEqual(await check(), { ready: false });
  resolve(true);
  await new Promise((done) => setImmediate(done));
  assert.deepEqual(await check(), { ready: false });
  const draining = createReadinessChecker({ isDraining: () => true,
    mongoProbe: () => { throw new Error('Must not probe while draining'); } });
  assert.deepEqual(await draining(), { ready: false });
});

test('Redis command and quit deadlines fail closed and destroy a stalled connection', async () => {
  let destroyed = 0;
  setRedisClientForTests({ isReady: true, isOpen: true, sendCommand: () => new Promise(() => {}),
    quit: () => new Promise(() => {}), destroy: () => { destroyed += 1; } });
  try {
    await assert.rejects(sendRedisCommand(['GET', 'synthetic'], { timeoutMs: 10 }), /timed out/);
    await assert.rejects(closeRedis({ timeoutMs: 10 }), /timed out/);
    assert.equal(destroyed, 1);
  } finally { resetRedisClientForTests(); }
});

test('API shutdown is single-flight and its deadline includes dependency cleanup', async () => {
  let release;
  let cleanupCalls = 0;
  const exits = [];
  const stop = createShutdownHandler({ timeoutMs: 10, onExit: (code) => exits.push(code),
    cleanup: () => { cleanupCalls += 1; return new Promise((resolve) => { release = resolve; }); } });
  const first = stop('SIGTERM');
  assert.equal(stop('SIGINT'), first);
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.deepEqual(exits, [1]);
  assert.equal(cleanupCalls, 1);
  release();
  await first;
});

test('worker shutdown keeps its deadline through Mongo cleanup and removes signal listeners', async () => {
  const events = new EventEmitter();
  let release;
  let forced = 0;
  const running = startNotificationWorker({ events, timeoutMs: 10, onForcedExit: () => { forced += 1; },
    connect: async () => {}, prerequisites: async () => {}, flush: async () => {},
    workerFactory: () => ({ run: async () => {} }),
    disconnect: () => new Promise((resolve) => { release = resolve; }),
  });
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(forced, 1);
  release();
  await running;
  assert.equal(events.listenerCount('SIGTERM'), 0);
  assert.equal(events.listenerCount('SIGINT'), 0);
});

test('worker startup failure cleans resources without claiming jobs', async () => {
  let disconnected = 0;
  await assert.rejects(startNotificationWorker({ events: new EventEmitter(),
    connect: async () => { throw new Error('Startup failure'); },
    disconnect: async () => { disconnected += 1; }, flush: async () => {},
    workerFactory: () => { throw new Error('Must not start worker'); },
  }), /Startup failure/);
  assert.equal(disconnected, 1);
});

test('SIGTERM during the maintenance sweep starts no claim batch', async () => {
  const controller = new AbortController();
  const worker = createNotificationWorker({ terminalSweep: async () => controller.abort() });
  await worker.run({ signal: controller.signal });
});

test('fatal shutdown escalates an existing clean drain and cleanup failures exit non-zero', async () => {
  let release;
  const exits = [];
  const stop = createShutdownHandler({ timeoutMs: 100, onExit: (code) => exits.push(code),
    cleanup: () => new Promise((resolve) => { release = resolve; }) });
  const running = stop('SIGTERM');
  await new Promise((resolve) => setImmediate(resolve));
  stop('fatal', 1);
  release();
  await running;
  assert.deepEqual(exits, [1]);
  const failure = createShutdownHandler({ timeoutMs: 100, onExit: (code) => exits.push(code),
    cleanup: async () => { throw new Error('Cleanup failed'); } });
  await failure('SIGINT');
  assert.deepEqual(exits, [1, 1]);
});

test('request logging uses route templates and never arbitrary URL segments', () => {
  assert.equal(safeRequestPath({ path: '/private-sensitive-value' }), '/unmatched');
  assert.equal(safeRequestPath({ path: '/staff/private-sensitive-value', route: { path: '/staff/:id' } }), '/staff/:id');
});

test('Redis limiter initializes lazily, single-flight and recovers from failed initial script loading', async () => {
  let available = false;
  let scripts = 0;
  const store = createRedisRateLimitStore('deployment-regression', async (args) => {
    if (!available) throw new Error('Redis unavailable');
    if (args[0] === 'SCRIPT') { scripts += 1; return 'synthetic-sha'; }
    return [1, 60000];
  });
  store.init({ windowMs: 60000 });
  assert.equal(scripts, 0);
  await assert.rejects(store.increment('synthetic'), /Redis unavailable/);
  available = true;
  const results = await Promise.all([store.increment('a'), store.increment('b')]);
  assert.equal(scripts, 2);
  assert.ok(results.every(({ totalHits }) => totalHits === 1));
});
