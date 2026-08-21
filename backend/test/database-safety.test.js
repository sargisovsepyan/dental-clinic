import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';

const {
  assertSafeTestDatabaseConnection,
  clearTestDatabase,
} = await import('../test-support/database.js');
const { clearReplTestDatabase } = await import(
  '../test-support/replDatabase.js'
);


test('destructive test database guard requires test mode, an active connection, and the exact database name', () => {
  const safeConnection = {
    readyState: 1,
    name: 'dental_clinic_test',
  };

  assert.throws(
    () => assertSafeTestDatabaseConnection({
      nodeEnv: 'production',
      connection: safeConnection,
    }),
    /outside NODE_ENV=test/
  );
  assert.throws(
    () => assertSafeTestDatabaseConnection({
      nodeEnv: 'test',
      connection: { ...safeConnection, readyState: 0 },
    }),
    /without an active database connection/
  );
  assert.throws(
    () => assertSafeTestDatabaseConnection({
      nodeEnv: 'test',
      connection: { ...safeConnection, name: 'dental_clinic' },
    }),
    /against a non-test database/
  );
  assert.doesNotThrow(
    () => assertSafeTestDatabaseConnection({
      nodeEnv: 'test',
      connection: safeConnection,
    })
  );
});


test('both destructive clear helpers fail closed before enumerating a disconnected database', async () => {
  await assert.rejects(
    clearTestDatabase,
    /without an active database connection/
  );
  await assert.rejects(
    clearReplTestDatabase,
    /without an active database connection/
  );
});
