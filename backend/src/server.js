import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';

import app from './app.js';
import connectDB from './config/db.js';
import env from './config/env.js';
import { connectRedis, closeRedis } from './infrastructure/redis.js';
import { createShutdownHandler, isProcessDraining } from './infrastructure/processLifecycle.js';
import { checkStartupPrerequisites } from './production/startup.js';
import { assertReleaseEndpoints } from './production/releaseConfig.js';
import logger from './observability/logger.js';
import { flushErrorReports, reportError } from './observability/errorMonitor.js';

const startServer = async () => {
  let server;
  const shutdown = createShutdownHandler({
    timeoutMs: env.GRACEFUL_SHUTDOWN_TIMEOUT_MS,
    onStop: (signal) => logger.info('server_shutdown_started', { signal }),
    onDeadline: () => logger.error('server_shutdown_forced'),
    cleanup: async () => {
      if (server?.listening) {
        await new Promise((resolve, reject) => {
          server.close((error) => error ? reject(error) : resolve());
        });
      }
      const results = await Promise.allSettled([mongoose.disconnect(), closeRedis()]);
      await flushErrorReports();
      if (results.some(({ status }) => status === 'rejected')) {
        throw new Error('Dependency shutdown failed');
      }
      logger.info('server_shutdown_completed');
    },
  });
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  const fatal = (event, reason) => {
    const error = reason instanceof Error ? reason : new Error('Fatal process failure');
    logger.error(event, { error });
    reportError(error, { path: 'process' });
    shutdown(event, 1);
  };
  process.once('uncaughtException', (error) => fatal('uncaught_exception', error));
  process.once('unhandledRejection', (error) => fatal('unhandled_rejection', error));

  try {
    assertReleaseEndpoints(env);
    await connectDB();
    await checkStartupPrerequisites();
    await connectRedis();
    if (isProcessDraining()) return;
    server = app.listen(env.PORT);
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    logger.info('server_started', { port: env.PORT });
    return server;
  }
  catch (error) {
    logger.error('server_start_failed', { error });
    reportError(error, { path: 'startup' });
    await shutdown('startup_failure', 1);
  }
};

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await startServer();
}

export { startServer };
