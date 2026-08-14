import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/dental_clinic_test';
process.env.JWT_SECRET = 'test-only-secret-that-is-at-least-thirty-two-characters';
process.env.CLIENT_URL = 'http://localhost:5173';

const { validateEnvironment } = await import('../src/config/env.js');
const {
  isCredentialOriginAllowed,
} = await import('../src/middlewares/transportSecurity.js');
const { sanitizeLogValue } = await import('../src/observability/logger.js');
const {
  createRedisRateLimitStore,
} = await import('../src/middlewares/rateLimiter.js');

const backendRoot = fileURLToPath(new URL('..', import.meta.url));


const productionEnvironment = (overrides = {}) => ({
  NODE_ENV: 'production',
  PORT: '5000',
  MONGO_URI:
    'mongodb+srv://app:database-password@cluster.example/dental_clinic',
  JWT_SECRET: 'j'.repeat(48),
  APPOINTMENT_QUOTA_SECRET: 'q'.repeat(48),
  RATE_LIMIT_KEY_SECRET: 'r'.repeat(48),
  CLIENT_URL: 'https://clinic.example.test',
  CORS_ORIGINS:
    'https://clinic.example.test,https://staff.example.test',
  FRONTEND_URL: 'https://staff.example.test',
  REQUIRE_HTTPS: 'true',
  TRUST_PROXY_HOPS: '1',
  REFRESH_COOKIE_SECURE: 'true',
  REFRESH_COOKIE_SAME_SITE: 'strict',
  API_REPLICA_COUNT: '3',
  RATE_LIMIT_STORE: 'redis',
  REDIS_URL: 'rediss://:redis-password@redis.example.test:6380/0',
  SMTP_HOST: 'smtp.example.test',
  SMTP_PORT: '465',
  SMTP_SECURE: 'true',
  SMTP_USER: 'mailer',
  SMTP_PASSWORD: 'smtp-password',
  MAIL_FROM: 'clinic@example.test',
  CLOUDINARY_CLOUD_NAME: 'clinic-cloud',
  CLOUDINARY_API_KEY: 'cloud-key',
  CLOUDINARY_API_SECRET: 'cloud-secret',
  ERROR_MONITOR_WEBHOOK_URL: 'https://monitor.example.test/report',
  ...overrides,
});


test('valid production configuration is typed, exact-origin, and replica safe', () => {
  const result = validateEnvironment(productionEnvironment({
    UNRELATED_SECRET: 'must-not-enter-runtime-config',
  }));
  assert.equal(result.NODE_ENV, 'production');
  assert.equal(result.TRUST_PROXY_HOPS, 1);
  assert.equal(result.API_REPLICA_COUNT, 3);
  assert.deepEqual(result.CORS_ORIGINS, [
    'https://clinic.example.test',
    'https://staff.example.test',
  ]);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.CORS_ORIGINS), true);
  assert.equal(result.UNRELATED_SECRET, undefined);
});


test('importing the production app does not connect to external infrastructure', () => {
  const child = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      "await import('./src/app.js'); process.stdout.write('imported')",
    ],
    {
      cwd: backendRoot,
      env: productionEnvironment({
        REDIS_URL: 'rediss://redis-never-contact.invalid:6380/0',
      }),
      encoding: 'utf8',
      timeout: 5000,
    }
  );

  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout, 'imported');
});


test('production rejects unsafe transport, shared-state, credential, and secret combinations', () => {
  const invalidCases = [
    { REQUIRE_HTTPS: 'false' },
    { TRUST_PROXY_HOPS: '0' },
    { REFRESH_COOKIE_SECURE: 'false' },
    { CORS_ORIGINS: 'http://clinic.example.test' },
    { FRONTEND_URL: 'https://unknown.example.test' },
    { MONGO_URI: 'mongodb://db.example.test/dental_clinic' },
    { MONGO_URI: 'mongodb+srv://' },
    { RATE_LIMIT_STORE: 'memory', API_REPLICA_COUNT: '1' },
    { REDIS_URL: 'redis://redis.example.test:6379' },
    { APPOINTMENT_QUOTA_SECRET: 'j'.repeat(48) },
    { RATE_LIMIT_KEY_SECRET: 'q'.repeat(48) },
    { SMTP_PASSWORD: '' },
    { CLOUDINARY_API_SECRET: '' },
    { ERROR_MONITOR_WEBHOOK_URL: '' },
    {
      MEDIA_CLEANUP_BACKOFF_BASE_SECONDS: '120',
      MEDIA_CLEANUP_BACKOFF_MAX_SECONDS: '60',
    },
  ];

  for (const invalid of invalidCases) {
    assert.throws(
      () => validateEnvironment(productionEnvironment(invalid)),
      Error,
      JSON.stringify(invalid)
    );
  }
});


test('multi-instance memory limiting is rejected and tests force the isolated store', () => {
  assert.throws(() => validateEnvironment({
    NODE_ENV: 'development',
    MONGO_URI: 'mongodb://127.0.0.1:27017/dental_clinic',
    JWT_SECRET: 'j'.repeat(48),
    CLIENT_URL: 'http://localhost:5173',
    API_REPLICA_COUNT: '2',
    RATE_LIMIT_STORE: 'memory',
  }), /Multiple API replicas/);

  const testConfig = validateEnvironment({
    NODE_ENV: 'test',
    MONGO_URI: 'mongodb://127.0.0.1:27017/dental_clinic_test',
    JWT_SECRET: 'j'.repeat(48),
    CLIENT_URL: 'http://localhost:5173',
    RATE_LIMIT_STORE: 'redis',
    REDIS_URL: 'rediss://should-never-be-contacted.example.test',
  });
  assert.equal(testConfig.RATE_LIMIT_STORE, 'memory');
});


test('Redis limiter adapter sends the supported flat command shape', async () => {
  const commands = [];
  let scriptNumber = 0;
  const store = createRedisRateLimitStore('contract-test', async (command) => {
    commands.push(command);
    if (command[0] === 'SCRIPT') {
      scriptNumber += 1;
      return `script-${scriptNumber}`;
    }
    if (command[0] === 'EVALSHA') {
      return [1, 60_000];
    }
    throw new Error(`Unexpected command ${command[0]}`);
  });

  await store.init({ windowMs: 60_000 });
  const result = await store.increment('account-key');
  assert.equal(result.totalHits, 1);
  assert.ok(result.resetTime instanceof Date);
  assert.equal(commands.filter((command) => command[0] === 'SCRIPT').length, 2);
  assert.deepEqual(
    commands.find((command) => command[0] === 'EVALSHA').slice(2, 5),
    ['1', 'dental-clinic:rate-limit:contract-test:account-key', '60000']
  );
});


test('test database guard rejects remote and non-test databases', () => {
  const base = {
    NODE_ENV: 'test',
    JWT_SECRET: 'j'.repeat(48),
    CLIENT_URL: 'http://localhost:5173',
  };
  assert.throws(() => validateEnvironment({
    ...base,
    MONGO_URI: 'mongodb://db.example.test/dental_clinic_test',
  }), /localhost MongoDB/);
  assert.throws(() => validateEnvironment({
    ...base,
    MONGO_URI: 'mongodb://127.0.0.1:27017/dental_clinic',
  }), /containing "test"/);
});


test('credentialed auth origins are exact and fail closed in production', () => {
  const allowed = ['https://clinic.example.test'];
  assert.equal(
    isCredentialOriginAllowed('https://clinic.example.test', true, allowed),
    true
  );
  assert.equal(
    isCredentialOriginAllowed('https://clinic.example.test.evil', true, allowed),
    false
  );
  assert.equal(isCredentialOriginAllowed('', true, allowed), false);
  assert.equal(isCredentialOriginAllowed('', false, allowed), true);
});


test('structured logging redacts secrets and patient identifiers recursively', () => {
  const secret = 'must-never-appear';
  const sanitized = sanitizeLogValue({
    password: secret,
    refresh_token: secret,
    patientEmail: secret,
    nested: {
      authorization: `Bearer ${secret}`,
      safe: 'retained',
    },
  });
  assert.equal(JSON.stringify(sanitized).includes(secret), false);
  assert.equal(sanitized.nested.safe, 'retained');
});
