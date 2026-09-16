// Dynamic imports keep malformed configuration inside the safe-output boundary.
let disconnect = async () => {};
let closeRedis = async () => {};
let exitCode = 1;
let stage = 'configuration';
const deadline = setTimeout(() => {
  process.stdout.write(JSON.stringify({ event: 'production_preflight_timed_out', ok: false }) + '\n');
  process.exit(1);
}, 90000);

try {
  const args = process.argv.slice(2);
  if (args.some((argument) => argument !== '--config-only')) throw new Error('Unsupported argument');
  const { default: env, mongoOptions } = await import('../config/env.js');
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (!(major === 22 && minor >= 12 || major === 24)) throw new Error('Unsupported Node runtime');
  if (env.NODE_ENV !== 'production') throw new Error('Production mode required');
  if (args.includes('--config-only')) {
    process.stdout.write(JSON.stringify({
      event: 'production_preflight_config_completed', ok: true,
      checks: ['runtime', 'production_environment'], providerContact: false,
    }) + '\n');
    exitCode = 0;
  }
  else {
    stage = 'release_endpoints';
    const { assertReleaseEndpoints } = await import('../production/releaseConfig.js');
    assertReleaseEndpoints(env);
    const { default: mongoose } = await import('mongoose');
    disconnect = () => mongoose.disconnect();
    const redis = await import('../infrastructure/redis.js');
    closeRedis = redis.closeRedis;
    const { default: connectDB } = await import('../config/db.js');
    const { runProductionPreflight } = await import('../production/preflight.service.js');
    stage = 'mongodb';
    await connectDB();
    const identityOk = mongoose.connection.name === mongoOptions(env.MONGO_URI).dbName;
    stage = 'redis';
    await redis.connectRedis();
    const redisOk = await redis.isRedisReady();
    stage = 'data_preflight';
    const report = await runProductionPreflight();
    report.checks.push({ name: 'database_identity', ok: identityOk });
    report.checks.push({ name: 'redis_connectivity', ok: redisOk });
    report.ok = report.ok && identityOk && redisOk;
    process.stdout.write(JSON.stringify({
      event: 'production_preflight_completed', ...report,
    }) + '\n');
    exitCode = report.ok ? 0 : 1;
  }
}
catch {
  // Never print schema exceptions, URI strings, provider responses, or stacks.
  process.stdout.write(JSON.stringify({ event: 'production_preflight_failed', ok: false, stage }) + '\n');
}
finally {
  const results = await Promise.allSettled([disconnect(), closeRedis()]);
  if (results.some(({ status }) => status === 'rejected')) exitCode = 1;
  clearTimeout(deadline);
  process.exitCode = exitCode;
}
