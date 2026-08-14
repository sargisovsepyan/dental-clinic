import mongoose from 'mongoose';

import env from '../config/env.js';
import connectDB from '../config/db.js';
import { runProductionPreflight } from '../production/preflight.service.js';
import logger from '../observability/logger.js';


if (env.NODE_ENV !== 'production') {
  throw new Error('Production preflight requires NODE_ENV=production');
}

let exitCode = 1;
try {
  await connectDB();
  const report = await runProductionPreflight();
  process.stdout.write(`${JSON.stringify({
    event: 'production_preflight_completed',
    ...report,
  })}\n`);
  exitCode = report.ok ? 0 : 1;
}
catch (error) {
  logger.error('production_preflight_failed', { error });
  process.stdout.write(`${JSON.stringify({
    event: 'production_preflight_failed',
    ok: false,
  })}\n`);
}
finally {
  await mongoose.disconnect().catch(() => {});
  process.exitCode = exitCode;
}
