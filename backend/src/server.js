import mongoose from 'mongoose';

import app from './app.js';
import connectDB from './config/db.js';
import env from './config/env.js';
import { connectRedis, closeRedis } from './infrastructure/redis.js';
import logger from './observability/logger.js';
import { flushErrorReports, reportError } from './observability/errorMonitor.js';


const startServer = async () => {
  await connectDB();
  try {
    await connectRedis();
  }
  catch (error) {
    await Promise.allSettled([
      mongoose.disconnect(),
      closeRedis(),
    ]);
    throw error;
  }

  const server = app.listen(env.PORT, () => {
    logger.info('server_started', { port: env.PORT });
  });

  let shuttingDown = false;
  const shutdown = async (signal, exitCode = 0) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info('server_shutdown_started', { signal });

    const forcedExit = setTimeout(() => {
      logger.error('server_shutdown_forced', { signal });
      server.closeAllConnections?.();
      process.exit(1);
    }, env.GRACEFUL_SHUTDOWN_TIMEOUT_MS);
    forcedExit.unref();

    try {
      await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
      await Promise.allSettled([
        mongoose.disconnect(),
        closeRedis(),
      ]);
      await flushErrorReports();
      clearTimeout(forcedExit);
      logger.info('server_shutdown_completed', { signal });
      process.exit(exitCode);
    }
    catch (error) {
      clearTimeout(forcedExit);
      logger.error('server_shutdown_failed', { signal, error });
      process.exit(1);
    }
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('uncaughtException', (error) => {
    logger.error('uncaught_exception', { error });
    reportError(error, { path: 'process' });
    shutdown('uncaughtException', 1);
  });
  process.once('unhandledRejection', (reason) => {
    const error = reason instanceof Error
      ? reason
      : new Error('Unhandled promise rejection');
    logger.error('unhandled_rejection', { error });
    reportError(error, { path: 'process' });
    shutdown('unhandledRejection', 1);
  });

  return server;
};


startServer().catch(async (error) => {
  logger.error('server_start_failed', { error });
  reportError(error, { path: 'startup' });
  await flushErrorReports();
  process.exit(1);
});


export { startServer };
