import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/dental_clinic_test';
process.env.JWT_SECRET = 'test-only-secret-that-is-at-least-thirty-two-characters';
process.env.CLIENT_URL = 'http://localhost:5173';

const {
  connectRedis,
  sendRedisCommand,
  isRedisReady,
  setRedisClientForTests,
  resetRedisClientForTests,
} = await import('../src/infrastructure/redis.js');


const fakeClient = (overrides = {}) => ({
  isOpen: false,
  isReady: false,
  async connect() {},
  async ping() {
    return 'PONG';
  },
  async sendCommand(args) {
    return args;
  },
  destroy() {},
  ...overrides,
});


afterEach(() => {
  resetRedisClientForTests();
});


test('Redis startup timeout destroys the reconnecting client', async () => {
  let destroyed = 0;
  const redisClient = fakeClient({
    isOpen: false,
    connect() {
      this.isOpen = true;
      return new Promise(() => {});
    },
    ping() {
      throw new Error('ping must not run before the initial connection completes');
    },
    destroy() {
      destroyed += 1;
      this.isOpen = false;
      this.isReady = false;
    },
  });
  setRedisClientForTests(redisClient);

  await assert.rejects(
    () => connectRedis({ timeoutMs: 10 }),
    /Redis startup connection timed out/
  );
  assert.equal(destroyed, 1);
  assert.equal(redisClient.isOpen, false);
  assert.equal(redisClient.isReady, false);
});


test('Redis commands fail closed without entering an offline queue', async () => {
  let commands = 0;
  setRedisClientForTests(fakeClient({
    isOpen: true,
    isReady: false,
    async sendCommand() {
      commands += 1;
    },
  }));

  await assert.rejects(
    () => sendRedisCommand(['GET', 'key']),
    /Redis is not ready/
  );
  assert.equal(commands, 0);
});


test('Redis commands use the ready client', async () => {
  const commands = [];
  setRedisClientForTests(fakeClient({
    isOpen: true,
    isReady: true,
    async sendCommand(args) {
      commands.push(args);
      return 'value';
    },
  }));

  assert.equal(await sendRedisCommand(['GET', 'key']), 'value');
  assert.deepEqual(commands, [['GET', 'key']]);
});


test('Redis readiness recovers after the runtime client becomes ready', async () => {
  let pings = 0;
  const redisClient = fakeClient({
    isOpen: true,
    isReady: false,
    async ping() {
      pings += 1;
      return 'PONG';
    },
  });
  setRedisClientForTests(redisClient);

  assert.equal(await isRedisReady(), false);
  assert.equal(pings, 0);

  redisClient.isReady = true;
  assert.equal(await isRedisReady(), true);
  assert.equal(pings, 1);
});
