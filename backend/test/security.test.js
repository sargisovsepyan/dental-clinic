import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import Joi from 'joi';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/dental_clinic_test';
process.env.JWT_SECRET = 'test-only-secret-that-is-at-least-thirty-two-characters';
process.env.CLIENT_URL = 'http://localhost:5173';

const { connectTestDatabase, clearTestDatabase, disconnectTestDatabase } = await import('../test-support/database.js');
const { default: app } = await import('../src/app.js');
const { default: validate } = await import('../src/middlewares/validate.js');
const { default: rejectNoSqlOperators } = await import('../src/middlewares/security.js');
const {
  default: errorHandler,
  buildErrorBody,
} = await import('../src/middlewares/errorHandler.js');
const { sanitizeValue, logAuditEvent } = await import('../src/modules/audit/audit.service.js');
const { default: AuditLog } = await import('../src/modules/audit/audit.model.js');
const {
  MAX_PENDING_REPORTS,
  reportError,
  flushErrorReports,
  setErrorReporterForTests,
  resetErrorReporterForTests,
} = await import('../src/observability/errorMonitor.js');
const { redactText } = await import('../src/observability/logger.js');

before(async () => {
  await connectTestDatabase();
  await clearTestDatabase();
});
after(disconnectTestDatabase);

test('unknown routes return 404 rather than leaking through as 500', async () => {
  const response = await request(app).get('/api/v1/does-not-exist');
  assert.equal(response.status, 404);
  assert.equal(response.body.message, 'Route not found');
});

test('error monitoring bounds in-flight delivery during a slow endpoint burst', async () => {
  const releases = [];
  setErrorReporterForTests(() => new Promise((resolve) => {
    releases.push(resolve);
  }));

  try {
    for (let index = 0; index < MAX_PENDING_REPORTS + 25; index += 1) {
      reportError(new Error('sensitive internal detail'), {
        requestId: `burst-${index}`,
      });
    }
    assert.equal(releases.length, MAX_PENDING_REPORTS);

    for (const release of releases) {
      release();
    }
    await flushErrorReports();
  }
  finally {
    resetErrorReporterForTests();
  }
});

test('malformed and oversized JSON bodies map to 400 and 413', async () => {
  const malformed = await request(app)
    .post('/api/v1/auth/login')
    .set('Content-Type', 'application/json')
    .send('{"email":');
  assert.equal(malformed.status, 400);
  assert.equal(malformed.body.message, 'Malformed JSON body');

  const oversized = await request(app)
    .post('/api/v1/auth/login')
    .send({ padding: 'x'.repeat(101 * 1024) });
  assert.equal(oversized.status, 413);
  assert.equal(oversized.body.message, 'Request body is too large');
});

test('NoSQL operator middleware rejects nested and dotted operator-shaped data', async () => {
  const localApp = express();
  localApp.use(express.json());
  localApp.use(rejectNoSqlOperators);
  localApp.post('/', (_req, res) => res.sendStatus(204));
  localApp.use(errorHandler);
  assert.equal((await request(localApp).post('/').send({ nested: { $ne: null } })).status, 400);
  assert.equal((await request(localApp).post('/').send({ 'profile.password': 'x' })).status, 400);
});

test('validation strips unknown properties and uses a separate Express 5 query value', async () => {
  const localApp = express();
  localApp.use(express.json());
  localApp.post(
    '/',
    validate({
      body: Joi.object({ known: Joi.string().required() }),
      query: Joi.object({ page: Joi.number().integer().default(1) }),
    }),
    (req, res) => res.json({ body: req.body, query: req.validatedQuery }),
  );
  localApp.use(errorHandler);
  const response = await request(localApp).post('/?page=2&ignored=yes').send({ known: 'ok', ignored: 'removed' });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { body: { known: 'ok' }, query: { page: 2 } });
});

test('invalid ObjectIds and invalid pagination are rejected before database access', async () => {
  assert.equal((await request(app).get('/api/v1/before-after/not-an-object-id')).status, 400);
  assert.equal((await request(app).get('/api/v1/before-after?page=0')).status, 400);
  assert.equal((await request(app).get('/api/v1/services?unexpected=true')).status, 200);
});

test('CORS allows browser PUT preflight for declared APIs and rejects unknown origins', async () => {
  const preflight = await request(app)
    .options('/api/v1/clinic/closures/2030-01-01')
    .set('Origin', 'http://localhost:5173')
    .set('Access-Control-Request-Method', 'PUT');
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers['access-control-allow-methods'], /PUT/);
  assert.equal(preflight.headers['access-control-allow-credentials'], 'true');

  const publicResponse = await request(app)
    .get('/api/v1/health')
    .set('Origin', 'http://localhost:5173');
  const exposed = publicResponse.headers['access-control-expose-headers'];
  assert.match(exposed, /Retry-After/i);
  assert.match(exposed, /RateLimit/i);
  assert.match(exposed, /X-Request-Id/i);

  const rejected = await request(app)
    .get('/api/v1/health')
    .set('Origin', 'https://attacker.example');
  assert.equal(rejected.status, 403);
});

test('health responses include request IDs and security headers', async () => {
  const response = await request(app).get('/api/v1/health');
  assert.equal(response.status, 200);
  assert.match(response.headers['x-request-id'], /^[0-9a-f-]{36}$/i);
  assert.equal(response.headers['x-powered-by'], undefined);
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
});

test('audit sanitizer removes sensitive keys case-insensitively and recursively', () => {
  const secret = 'must-not-survive';
  const input = {
    password: secret,
    Password: secret,
    PASSWORD: secret,
    passwordHash: secret,
    accessToken: secret,
    access_token: secret,
    bearerToken: secret,
    refreshToken: secret,
    authorization: secret,
    Authorization: secret,
    cookie: secret,
    set_cookie: secret,
    jwt: secret,
    apiSecret: secret,
    patientPhone: secret,
    patient_phone: secret,
    patientEmail: secret,
    contactEmailAddress: secret,
    callbackPhoneNumber: secret,
    patientDetails: secret,
    internalNote: secret,
    nested: { patientEmail: secret, safe: 'retained' },
    safe: true,
  };
  const sanitized = sanitizeValue(input);
  assert.equal(JSON.stringify(sanitized).includes(secret), false);
  assert.deepEqual(sanitized, { nested: { safe: 'retained' }, safe: true });
});

test('log text redaction removes credentials embedded in service URLs', () => {
  const username = 'service-operator';
  const password = 'example-password';
  const credentialedUri = [
    'rediss://',
    username,
    ':',
    password,
    '@cache.example.test:6380/0',
  ].join('');

  const redacted = redactText(`Connection failed for ${credentialedUri}`);

  assert.equal(redacted.includes(username), false);
  assert.equal(redacted.includes(password), false);
  assert.equal(
    redacted,
    'Connection failed for rediss://[REDACTED]@cache.example.test:6380/0',
  );

  const jwtLikeValue = [
    'eyJhbGciOiJIUzI1NiJ9',
    'eyJzdWIiOiIxMjM0NTY3ODkwIn0',
    'signaturesegment',
  ].join('.');
  assert.equal(redactText(jwtLikeValue), '[REDACTED_JWT]');
});

test('stored audit metadata never contains sensitive values', async () => {
  await AuditLog.deleteMany({});
  const secret = 'stored-secret-value';
  await logAuditEvent({
    req: {
      id: 'test-request-id',
      method: 'PATCH',
      originalUrl: '/api/v1/test',
      ip: '127.0.0.1',
      get: () => 'test-agent',
    },
    action: 'test.sanitize',
    entityType: 'test',
    metadata: {
      safe: 'visible',
      password: secret,
      nested: { access_token: secret, patient_phone: secret },
    },
  });
  const stored = await AuditLog.findOne({ action: 'test.sanitize' }).lean();
  assert.deepEqual(stored.metadata, { safe: 'visible' });
  assert.equal(JSON.stringify(stored).includes(secret), false);
  assert.notEqual(stored.ip, '127.0.0.1');
  assert.notEqual(stored.userAgent, 'test-agent');
  assert.match(stored.ip, /^[a-f0-9]{64}$/);
});

test('production error responses suppress stacks and unexpected internal messages', async () => {
  const internalError = new Error('database host internal.example');
  const response = buildErrorBody(internalError, true);
  assert.equal(response.statusCode, 500);
  assert.equal(response.body.stack, undefined);
  assert.equal(response.body.message, 'Internal server error');
  assert.equal(JSON.stringify(response.body).includes('internal.example'), false);

  const disguised = new Error('upstream secret detail');
  disguised.status = 400;
  const disguisedResponse = buildErrorBody(disguised, true);
  assert.equal(disguisedResponse.statusCode, 500);
  assert.equal(disguisedResponse.body.message, 'Internal server error');

  const validationError = new Error('validation failed');
  validationError.name = 'ValidationError';
  validationError.errors = {
    patientEmail: {
      message: 'Rejected value patient-private@example.test for patientEmail',
    },
  };
  const validationResponse = buildErrorBody(validationError, true);
  assert.equal(validationResponse.statusCode, 400);
  assert.equal(validationResponse.body.message, 'Invalid request data');
  assert.doesNotMatch(
    JSON.stringify(validationResponse.body),
    /patient-private@example\.test/
  );
});
