import { pathToFileURL } from 'node:url';

import mongoose from 'mongoose';

import connectDB from '../config/db.js';
import env from '../config/env.js';
import { createNotificationWorker } from '../modules/notifications/notificationWorker.service.js';
import logger from '../observability/logger.js';
import { flushErrorReports, reportError } from '../observability/errorMonitor.js';


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
      deadline.unref?.();
    },
    clear() {
      if (deadline) clearTimeout(deadline);
    },
  });
};


const startNotificationWorker = async () => {
  if (!env.NOTIFICATIONS_ENABLED) {
    throw new Error('Notification worker cannot start while notifications are disabled');
  }
  await connectDB();
  const controller = new AbortController();
  const worker = createNotificationWorker();
  const shutdown = createWorkerShutdownController({ controller });
  process.once('SIGINT', () => shutdown.stop('SIGINT'));
  process.once('SIGTERM', () => shutdown.stop('SIGTERM'));

  try {
    await worker.run({ signal: controller.signal });
  }
  finally {
    shutdown.clear();
    await mongoose.disconnect();
    await flushErrorReports();
  }
};


const isEntrypoint = process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (isEntrypoint) {
  startNotificationWorker().catch(async (error) => {
    logger.error('notification_worker_failed', { error });
    reportError(error, { path: 'notification-worker' });
    await flushErrorReports();
    await mongoose.disconnect().catch(() => {});
    process.exitCode = 1;
  });
}


export { createWorkerShutdownController, startNotificationWorker };
