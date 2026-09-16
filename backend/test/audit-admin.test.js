import test, {
  after,
  before,
  beforeEach,
} from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.MONGO_URI =
  'mongodb://127.0.0.1:27017/dental_clinic_test';
process.env.JWT_SECRET =
  'test-only-secret-that-is-at-least-thirty-two-characters';
process.env.JWT_EXPIRES_IN = '15m';
process.env.CLIENT_URL = 'http://localhost:5173';

const {
  connectReplTestDatabase,
  clearReplTestDatabase,
  disconnectReplTestDatabase,
} = await import('../test-support/replDatabase.js');
const { seedStaff } = await import(
  '../test-support/fixtures.js'
);
const { default: app } = await import(
  '../src/app.js'
);
const { default: AuditLog } = await import(
  '../src/modules/audit/audit.model.js'
);

let staff;

before(connectReplTestDatabase);

beforeEach(async () => {
  await clearReplTestDatabase();
  staff = await seedStaff();
});

after(disconnectReplTestDatabase);

const bearer = (token) => ({
  Authorization: `Bearer ${token}`,
});

const endpoint =
  '/api/v1/audit-logs';

test('audit administration is admin-only and no-store on every protected outcome', async () => {
  const responses = await Promise.all([
    request(app)
      .get(endpoint),
    request(app)
      .get(endpoint)
      .set(bearer(staff.receptionistToken)),
    request(app)
      .get(`${endpoint}?page=0`)
      .set(bearer(staff.adminToken)),
    request(app)
      .get(endpoint)
      .set(bearer(staff.adminToken)),
  ]);

  assert.deepEqual(
    responses.map(
      ({ status }) => status
    ),
    [401, 403, 400, 200]
  );

  for (const response of responses) {
    assert.equal(
      response.headers['cache-control'],
      'no-store'
    );
  }
});

test('audit administration returns only the explicit privacy-safe projection', async () => {
  const deletedActorId =
    new mongoose.Types.ObjectId();

  await AuditLog.collection.insertMany([
    {
      requestId: 'request-safe',
      actor: staff.admin._id,
      action: 'staff.role_changed',
      entityType: 'user',
      entityId: String(staff.receptionist._id),
      method: 'PATCH',
      path: '/staff/safe?token=private-query-token',
      ip: 'pseudonymized-ip-must-not-leave-api',
      userAgent: 'pseudonymized-agent-must-not-leave-api',
      metadata: {
        previousRole: 'receptionist',
        nextRole: 'dentist',
        patientName: 'Private Patient',
        patient_email: 'private@example.com',
        internalNotes: 'private-internal-note',
        rawRequestBody: { name: 'private-body-name' },
        jwtValue: 'private-jwt',
        nested: {
          Authorization: 'Bearer secret-token',
          cookie: 'refresh_token=secret',
          safeReason: 'approved',
        },
        '$unsafe': 'discarded',
        'unsafe.path': 'discarded',
      },
      createdAt: new Date('2026-09-15T08:00:00.000Z'),
    },
    {
      requestId: 'request-deleted-actor',
      actor: deletedActorId,
      action: 'future.unknown_action',
      entityType: 'future-entity',
      entityId: 'future-id',
      method: 'POST',
      path: '/future/path',
      ip: 'another-private-hash',
      userAgent: 'another-private-agent-hash',
      metadata: {},
      createdAt: new Date('2026-09-15T09:00:00.000Z'),
    },
  ]);

  const response = await request(app)
    .get(endpoint)
    .set(bearer(staff.adminToken));

  assert.equal(response.status, 200);
  assert.equal(response.body.data.logs.length, 2);

  const [deletedActor, populatedActor] =
    response.body.data.logs;

  assert.deepEqual(
    Object.keys(populatedActor).sort(),
    [
      '_id',
      'action',
      'actor',
      'createdAt',
      'entityId',
      'entityType',
      'metadata',
      'method',
      'path',
      'requestId',
    ]
  );

  assert.deepEqual(
    Object.keys(populatedActor.actor).sort(),
    ['_id', 'email', 'name', 'role']
  );
  assert.equal(
    populatedActor.actor.email,
    'admin@example.com'
  );
  assert.deepEqual(
    populatedActor.metadata,
    {
      previousRole: 'receptionist',
      nextRole: 'dentist',
      nested: {
        safeReason: 'approved',
      },
    }
  );

  assert.equal(deletedActor.actor, null);
  assert.equal(populatedActor.path, '/staff/safe');

  const serialized =
    JSON.stringify(response.body);
  for (const forbidden of [
    'pseudonymized-ip',
    'private-agent',
    'Private Patient',
    'private@example.com',
    'secret-token',
    'refresh_token',
    '$unsafe',
    'unsafe.path',
    'private-query-token',
    'private-internal-note',
    'private-body-name',
    'private-jwt',
  ]) {
    assert.equal(
      serialized.includes(forbidden),
      false,
      `response leaked ${forbidden}`
    );
  }
});

test('reversed audit date ranges fail validation before database access', async () => {
  const originalFind =
    AuditLog.find;
  let findCalls = 0;

  AuditLog.find = function (...args) {
    findCalls += 1;
    return originalFind.apply(
      this,
      args
    );
  };

  try {
    const response = await request(app)
      .get(
        `${endpoint}?from=2026-09-16T00%3A00%3A00.000Z&to=2026-09-15T00%3A00%3A00.000Z`
      )
      .set(bearer(staff.adminToken));

    assert.equal(response.status, 400);
    assert.equal(findCalls, 0);
    for (const from of ['2026-09-15', '2026-09-15T08:00:00']) {
      const ambiguous = await request(app).get(endpoint).query({ from }).set(bearer(staff.adminToken));
      assert.equal(ambiguous.status, 400);
      assert.equal(findCalls, 0);
      assert.equal(ambiguous.headers['cache-control'], 'no-store');
    }
  }
  finally {
    AuditLog.find = originalFind;
  }
});

test('audit unexpected database errors remain no-store', async () => {
  const originalFind = AuditLog.find;
  AuditLog.find = () => { throw new Error('private database failure'); };
  try {
    const response = await request(app).get(endpoint).set(bearer(staff.adminToken));
    assert.equal(response.status, 500);
    assert.equal(response.headers['cache-control'], 'no-store');
  } finally { AuditLog.find = originalFind; }
});

test('audit filtering and equal-timestamp pagination are deterministic', async () => {
  const createdAt =
    new Date('2026-09-15T10:00:00.000Z');

  const ids = [
    '68c7df100000000000000001',
    '68c7df100000000000000002',
    '68c7df100000000000000003',
  ].map(
    (id) =>
      new mongoose.Types.ObjectId(id)
  );

  await AuditLog.collection.insertMany(
    ids.map((id, index) => ({
      _id: id,
      requestId: `request-${index + 1}`,
      actor: staff.admin._id,
      action:
        index === 0
          ? 'staff.invited'
          : 'staff.sessions_revoked',
      entityType: 'user',
      entityId: `entity-${index + 1}`,
      method: 'POST',
      path: '/staff/action',
      metadata: {},
      createdAt,
    }))
  );

  const pageOne = await request(app)
    .get(`${endpoint}?page=1&limit=2`)
    .set(bearer(staff.adminToken));
  const pageTwo = await request(app)
    .get(`${endpoint}?page=2&limit=2`)
    .set(bearer(staff.adminToken));

  assert.equal(pageOne.status, 200);
  assert.equal(pageTwo.status, 200);
  assert.deepEqual(
    pageOne.body.data.logs.map(
      ({ _id }) => _id
    ),
    [String(ids[2]), String(ids[1])]
  );
  assert.deepEqual(
    pageTwo.body.data.logs.map(
      ({ _id }) => _id
    ),
    [String(ids[0])]
  );
  assert.deepEqual(
    pageOne.body.data.pagination,
    {
      page: 1,
      limit: 2,
      total: 3,
      pages: 2,
    }
  );

  const filtered = await request(app)
    .get(
      `${endpoint}?action=staff.invited&entityType=user&entityId=entity-1&actorId=${staff.admin._id}&from=2026-09-15T09%3A59%3A59.000Z&to=2026-09-15T10%3A00%3A01.000Z`
    )
    .set(bearer(staff.adminToken));

  assert.equal(filtered.status, 200);
  assert.equal(filtered.body.data.logs.length, 1);
  assert.equal(
    filtered.body.data.logs[0]._id,
    String(ids[0])
  );
  const offsetBoundary = await request(app).get(endpoint).query({ from: '2026-09-15T12:00:00+02:00', to: '2026-09-15T10:00:00Z' }).set(bearer(staff.adminToken));
  assert.equal(offsetBoundary.status, 200);
  assert.equal(offsetBoundary.body.data.pagination.total, 3);
});
