import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.MONGO_URI =
  'mongodb://127.0.0.1:27017/dental_clinic_test';
process.env.JWT_SECRET =
  'test-only-secret-that-is-at-least-thirty-two-characters';
process.env.CLIENT_URL = 'http://localhost:5173';

const {
  createReadinessChecker,
} = await import('../src/infrastructure/readiness.js');


test('readiness is single-flight, cached, and recovers after a cached failure', async () => {
  let timestamp = 1000;
  let mongoReady = true;
  let mongoCalls = 0;
  let redisCalls = 0;
  let releaseMongo;

  const checker = createReadinessChecker({
    now: () => timestamp,
    successCacheMs: 100,
    failureCacheMs: 25,
    mongoProbe: async () => {
      mongoCalls += 1;
      if (releaseMongo) {
        await new Promise((resolve) => {
          releaseMongo = resolve;
        });
      }
      return mongoReady;
    },
    redisProbe: async () => {
      redisCalls += 1;
      return true;
    },
  });

  releaseMongo = true;
  const first = checker();
  const concurrent = checker();
  assert.equal(mongoCalls, 1);
  const resolveMongo = releaseMongo;
  resolveMongo();
  assert.deepEqual(await first, { ready: true });
  assert.deepEqual(await concurrent, { ready: true });
  assert.equal(redisCalls, 1);

  assert.deepEqual(await checker(), { ready: true });
  assert.equal(mongoCalls, 1);

  timestamp += 101;
  mongoReady = false;
  releaseMongo = null;
  assert.deepEqual(await checker(), { ready: false });
  assert.equal(mongoCalls, 2);
  assert.deepEqual(await checker(), { ready: false });
  assert.equal(mongoCalls, 2);

  timestamp += 26;
  mongoReady = true;
  assert.deepEqual(await checker(), { ready: true });
  assert.equal(mongoCalls, 3);
});
