import { pathToFileURL } from 'node:url';

import mongoose from 'mongoose';

import connectDB from '../config/db.js';
import env from '../config/env.js';
import { createNotificationWorker } from '../modules/notifications/notificationWorker.service.js';
import logger from '../observability/logger.js';
import { flushErrorReports, reportError } from '../observability/errorMonitor.js';
import { checkStartupPrerequisites } from '../production/startup.js';
import { assertReleaseEndpoints } from '../production/releaseConfig.js';


const createWorkerShutdownController = ({
  controller,
  timeoutMs = env.GRACEFUL_SHUTDOWN_TIMEOUT_MS,
  onForcedExit = () => process.exit(1),
}) => {
  let stopping = false;
  let deadline = null;
  return Object.freeze({
    stop(signal) {
      if (stopping) return;
      stopping = true;
      logger.info('notification_worker_shutdown_started', { signal });
      controller.abort();
      deadline = setTimeout(() => {
        logger.error('notification_worker_shutdown_forced');
        onForcedExit(1);
      }, timeoutMs);
    },
    clear() {
      if (deadline) clearTimeout(deadline);
    },
  });
};


const startNotificationWorker = async ({
  connect = connectDB,
  prerequisites = checkStartupPrerequisites,
  disconnect = () => mongoose.disconnect(),
  flush = flushErrorReports,
  workerFactory = createNotificationWorker,
  events = process,
  timeoutMs = env.GRACEFUL_SHUTDOWN_TIMEOUT_MS,
  onForcedExit,
} = {}) => {
  if (!env.NOTIFICATIONS_ENABLED) {
    throw new Error('Notification worker cannot start while notifications are disabled');
  }
  const controller = new AbortController();
  const shutdown = createWorkerShutdownController({ controller, timeoutMs, onForcedExit });
  const onInterrupt = () => shutdown.stop('SIGINT');
  const onTerminate = () => shutdown.stop('SIGTERM');
  let fatalError;
  const onFatal = (reason) => {
    fatalError = reason instanceof Error ? reason : new Error('Fatal worker failure');
    logger.error('notification_worker_fatal', { error: fatalError });
    reportError(fatalError, { path: 'notification-worker' });
    shutdown.stop('fatal');
  };
  events.once('SIGINT', onInterrupt);
  events.once('SIGTERM', onTerminate);
  events.once('uncaughtException', onFatal);
  events.once('unhandledRejection', onFatal);

  try {
    assertReleaseEndpoints(env);
    await connect();
    await prerequisites();
    if (!controller.signal.aborted) {
      await workerFactory().run({ signal: controller.signal });
    }
    if (fatalError) throw fatalError;
  }
  catch (error) {
    logger.error('notification_worker_failed', { error });
    reportError(error, { path: 'notification-worker' });
    throw error;
  }
  finally {
    shutdown.stop('cleanup');
    try {
      const results = await Promise.allSettled([disconnect(), flush()]);
      if (results.some(({ status }) => status === 'rejected')) {
        throw new Error('Notification worker cleanup failed');
      }
    }
    finally {
      shutdown.clear();
      events.removeListener('SIGINT', onInterrupt);
      events.removeListener('SIGTERM', onTerminate);
      events.removeListener('uncaughtException', onFatal);
      events.removeListener('unhandledRejection', onFatal);
    }
  }
};


const isEntrypoint = process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (isEntrypoint) {
  startNotificationWorker().catch(async (error) => {
    logger.error('notification_worker_failed', { error });
    process.exitCode = 1;
  });
}


export { createWorkerShutdownController, startNotificationWorker };
