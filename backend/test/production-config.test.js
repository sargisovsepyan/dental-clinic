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
  bookingKey,
} = await import('../src/middlewares/rateLimiter.js');
const {
  createBotChallengeVerifier,
  TURNSTILE_URL,
} = await import('../src/security/botChallenge.js');
const {
  getSmtpTransportOptions,
} = await import('../src/mail/smtp.adapter.js');

const strongSecret = (prefix) =>
  `${prefix}A7!mQ2#zK9@pL4$xR8&vN6*`.repeat(3);

const fakeCredentialedRedisUrl = (hostname) => {
  const url = new URL('rediss://localhost');
  url.username = 'limiter';
  url.password = 'not-a-secret';
  url.hostname = hostname;
  url.port = '6380';
  url.pathname = '/0';
  return url.toString();
};

const backendRoot = fileURLToPath(new URL('..', import.meta.url));


const productionEnvironment = (overrides = {}) => ({
  NODE_ENV: 'production',
  PORT: '5000',
  MONGO_URI:
    'mongodb+srv://cluster.example/dental_clinic',
  JWT_SECRET: strongSecret('jwt'),
  APPOINTMENT_QUOTA_SECRET: strongSecret('quota'),
  APPOINTMENT_QUOTA_KEY_VERSION: 'v1',
  RATE_LIMIT_KEY_SECRET: strongSecret('limit'),
  AUDIT_PSEUDONYM_SECRET: strongSecret('audit'),
  APPOINTMENT_PRIVACY_POLICY_VERSION: '2026-01',
  CLIENT_URL: 'https://clinic.example.test',
  CORS_ORIGINS:
    'https://clinic.example.test,https://staff.example.test',
  FRONTEND_URL: 'https://staff.example.test',
  REQUIRE_HTTPS: 'true',
  TRUST_PROXY_HOPS: '1',
  TRUST_PROXY_CIDRS: '10.0.0.0/8',
  REFRESH_COOKIE_SECURE: 'true',
  REFRESH_COOKIE_SAME_SITE: 'strict',
  API_REPLICA_COUNT: '3',
  RATE_LIMIT_STORE: 'redis',
  REDIS_URL: fakeCredentialedRedisUrl('redis.example.test'),
  SMTP_HOST: 'smtp.example.test',
  SMTP_PORT: '465',
  SMTP_SECURE: 'true',
  SMTP_USER: 'mailer',
  SMTP_PASSWORD: 'smtp-password',
  MAIL_FROM: 'clinic@example.test',
  NOTIFICATIONS_ENABLED: 'true',
  CLINIC_NOTIFICATION_EMAIL: 'reception@example.test',
  BEFORE_AFTER_CONSENT_VERSION: '2026-01',
  CLOUDINARY_CLOUD_NAME: 'clinic-cloud',
  CLOUDINARY_API_KEY: 'cloud-key',
  CLOUDINARY_API_SECRET: 'cloud-secret',
  ERROR_MONITOR_WEBHOOK_URL: 'https://monitor.example.test/report',
  PUBLIC_BOOKING_CHALLENGE_PROVIDER: 'turnstile',
  PUBLIC_BOOKING_CHALLENGE_SECRET: strongSecret('challenge'),
  ...overrides,
});


test('valid production configuration is typed, exact-origin, and replica safe', () => {
  const result = validateEnvironment(productionEnvironment({
    UNRELATED_SECRET: 'must-not-enter-runtime-config',
  }));
  assert.equal(result.NODE_ENV, 'production');
  assert.equal(result.TRUST_PROXY_HOPS, 1);
  assert.deepEqual(result.TRUST_PROXY_CIDRS, ['10.0.0.0/8']);
  assert.equal(result.API_REPLICA_COUNT, 3);
  assert.deepEqual(result.CORS_ORIGINS, [
    'https://clinic.example.test',
    'https://staff.example.test',
  ]);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.CORS_ORIGINS), true);
  assert.equal(result.UNRELATED_SECRET, undefined);
});


test('disabled non-production notifications do not impose SMTP delivery lease coupling', () => {
  const result = validateEnvironment(productionEnvironment({
    NODE_ENV: 'development',
    NOTIFICATIONS_ENABLED: 'false',
    CLINIC_NOTIFICATION_EMAIL: '',
    NOTIFICATION_WORKER_LEASE_MS: '10000',
  }));
  assert.equal(result.NOTIFICATIONS_ENABLED, false);
  assert.equal(result.NOTIFICATION_WORKER_LEASE_MS, 10000);
});


test('importing the production app does not connect to external infrastructure', () => {
  const child = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      "await import('./src/app.js'); await import('./src/modules/notifications/notificationWorker.service.js'); process.stdout.write('imported')",
    ],
    {
      cwd: backendRoot,
      env: productionEnvironment({
        REDIS_URL: fakeCredentialedRedisUrl(
          'redis-never-contact.invalid'
        ),
      }),
      encoding: 'utf8',
      timeout: 5000,
    }
  );

  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout, 'imported');
});


test('maintenance CLI rejects a remote database mislabeled as development before connecting', () => {
  const child = spawnSync(
    process.execPath,
    ['src/scripts/migrate.js', '--apply'],
    {
      cwd: backendRoot,
      env: {
        ...process.env,
        NODE_ENV: 'development',
        MONGO_URI: 'mongodb://db.example.test/dental_clinic',
        JWT_SECRET: strongSecret('maintenance'),
        CLIENT_URL: 'http://localhost:5173',
      },
      encoding: 'utf8',
      timeout: 5000,
    }
  );

  assert.equal(child.status, 1);
  assert.match(child.stderr, /Remote database maintenance requires/);
});


test('production migration apply requires a declared stopped-write window and release evidence', () => {
  const run = (environment, extraArguments = []) => spawnSync(
    process.execPath,
    [
      'src/scripts/migrate.js',
      '--apply',
      '--operator-id=release-operator',
      ...extraArguments,
    ],
    {
      cwd: backendRoot,
      env: productionEnvironment({
        PRODUCTION_MAINTENANCE_ACK:
          'confirmed-backup-and-write-window',
        ...environment,
      }),
      encoding: 'utf8',
      timeout: 5000,
    }
  );

  const writersNotDrained = run({}, [
    '--release-artifact=commit-abcdef1234567890',
  ]);
  assert.equal(writersNotDrained.status, 1);
  assert.match(writersNotDrained.stderr, /stopped-write window/);

  const artifactMissing = run({ PRODUCTION_WRITES_DRAINED: 'true' });
  assert.equal(artifactMissing.status, 1);
  assert.match(artifactMissing.stderr, /release artifact identifier/);
});


test('production rejects unsafe transport, shared-state, credential, and secret combinations', () => {
  const invalidCases = [
    { REQUIRE_HTTPS: 'false' },
    { TRUST_PROXY_CIDRS: '' },
    { TRUST_PROXY_CIDRS: '999.999.999.999/99' },
    { TRUST_PROXY_CIDRS: '10.0.0.0/33' },
    { PUBLIC_BOOKING_CHALLENGE_SECRET: 'too-short' },
    { REFRESH_COOKIE_SECURE: 'false' },
    { CORS_ORIGINS: 'http://clinic.example.test' },
    { FRONTEND_URL: 'https://unknown.example.test' },
    { MONGO_URI: 'mongodb://db.example.test/dental_clinic' },
    { MONGO_URI: 'mongodb+srv://' },
    { RATE_LIMIT_STORE: 'memory', API_REPLICA_COUNT: '1' },
    { REDIS_URL: 'redis://redis.example.test:6379' },
    { REDIS_URL: 'rediss://redis.example.test:6379' },
    { APPOINTMENT_QUOTA_SECRET: strongSecret('jwt') },
    { RATE_LIMIT_KEY_SECRET: strongSecret('quota') },
    { AUDIT_PSEUDONYM_SECRET: strongSecret('limit') },
    { JWT_SECRET: 'replace_with_at_least_32_random_characters' },
    { REFRESH_COOKIE_DOMAIN: '.example.test' },
    { FRONTEND_URL: 'https://user:pass@staff.example.test' },
    { FRONTEND_URL: 'https://staff.example.test/reset' },
    { JWT_EXPIRES_IN: '2h' },
    { SMTP_SECURE: 'false', SMTP_REQUIRE_TLS: 'false', SMTP_PORT: '587' },
    { MAIL_FROM: "clinic@example.test\r\nBcc:attacker@example.test" },
    { SMTP_PASSWORD: '' },
    { NOTIFICATIONS_ENABLED: 'false' },
    { CLINIC_NOTIFICATION_EMAIL: '' },
    { NOTIFICATION_WORKER_LEASE_MS: '20000' },
    {
      NOTIFICATION_RETRY_BASE_SECONDS: '120',
      NOTIFICATION_RETRY_MAX_SECONDS: '60',
    },
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


test('booking limiter canonicalizes equivalent Armenian phone formats', () => {
  const first = bookingKey({
    body: { patientPhone: '091 23 45 67' },
    ip: '127.0.0.1',
  });
  const second = bookingKey({
    body: { patientPhone: '+374 91 23 45 67' },
    ip: '127.0.0.2',
  });
  assert.equal(first, second);
});


test('bot challenge verifier is provider-abstracted and uses only the fake request', async () => {
  const calls = [];
  const verify = createBotChallengeVerifier({
    provider: 'turnstile',
    secret: 'server-side-test-secret',
    request: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        async json() {
          return { success: true };
        },
      };
    },
  });

  await verify({
    token: 'fake-browser-token',
    idempotencyKey: '123e4567-e89b-42d3-a456-426614174000',
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, TURNSTILE_URL);
  assert.equal(
    calls[0].options.body.get('secret'),
    'server-side-test-secret'
  );
  assert.equal(calls[0].options.body.has('remoteip'), false);
  assert.equal(
    calls[0].options.body.get('idempotency_key'),
    '123e4567-e89b-42d3-a456-426614174000'
  );

  const reject = createBotChallengeVerifier({
    provider: 'turnstile',
    secret: 'server-side-test-secret',
    request: async () => ({
      ok: true,
      async json() {
        return { success: false };
      },
    }),
  });
  await assert.rejects(
    () => reject({ token: 'invalid-browser-token' }),
    /verification failed/
  );

  const testFailClosed = createBotChallengeVerifier({
    provider: 'turnstile',
    secret: 'server-side-test-secret',
  });
  await assert.rejects(
    () => testFailClosed({ token: 'must-never-leave-the-test-process' }),
    /verification is unavailable/
  );
});


test('SMTP adapter enforces STARTTLS and bounded transport timeouts', () => {
  const options = getSmtpTransportOptions();
  assert.equal(options.requireTLS, true);
  assert.equal(options.dnsTimeout, options.connectionTimeout);
  assert.equal(options.greetingTimeout, options.connectionTimeout);
  assert.ok(options.connectionTimeout <= 30_000);
  assert.ok(options.socketTimeout <= 120_000);
  assert.equal(options.disableFileAccess, true);
  assert.equal(options.disableUrlAccess, true);
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
