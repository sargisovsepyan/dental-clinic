import mongoose from 'mongoose';

import connectDB from '../config/db.js';
import { runDueMediaCleanup } from '../modules/media/mediaCleanup.service.js';
import logger from '../observability/logger.js';
import { assertMaintenanceSafety } from './maintenanceGuard.js';


const limitArgument = process.argv.find((argument) => argument.startsWith('--limit='));
const limit = limitArgument
  ? Number.parseInt(limitArgument.split('=')[1], 10)
  : 50;

if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
  throw new Error('--limit must be an integer between 1 and 500');
}

let exitCode = 0;
try {
  assertMaintenanceSafety();
  await connectDB();
  const results = await runDueMediaCleanup({
    limit,
    workerId: `reconcile-${process.pid}`,
  });
  process.stdout.write(`${JSON.stringify({
    event: 'media_cleanup_reconciliation_completed',
    processed: results.length,
    completed: results.filter((job) => job.status === 'completed').length,
    pending: results.filter((job) => job.status === 'pending').length,
    failed: results.filter((job) => job.status === 'failed').length,
  })}\n`);
}
catch (error) {
  exitCode = 1;
  logger.error('media_cleanup_reconciliation_failed', { error });
}
finally {
  await mongoose.disconnect().catch((error) => {
    exitCode = 1;
    logger.error('media_cleanup_disconnect_failed', { error });
  });
  process.exitCode = exitCode;
}
