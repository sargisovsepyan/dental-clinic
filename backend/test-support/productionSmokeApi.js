// Local smoke fixture ONLY. Use the real API with disposable DB and no providers.
if (process.env.NODE_ENV !== 'test') throw new Error('Smoke API requires isolated test mode');

const { default: connectDB } = await import('../src/config/db.js');
const { assertSafeTestDatabaseConnection } = await import('./database.js');
const { default: models } = await import('../src/production/models.js');
const { seedCore, seedStaff } = await import('./fixtures.js');
const { startServer } = await import('../src/server.js');
await connectDB();
assertSafeTestDatabaseConnection();
await Promise.all(models.map((model) => model.init()));
await seedCore();
await seedStaff();
// Windows cannot deliver a POSIX SIGTERM with child.kill; IPC invokes the actual
// registered API signal handler, without exposing an HTTP shutdown endpoint.
process.on('message', (message) => {
  if (message === 'isolated-smoke-shutdown') process.emit('SIGTERM');
});
await startServer();
