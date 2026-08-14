import mongoose from 'mongoose';

import env from '../config/env.js';
import connectDB from '../config/db.js';
import {
  findDuplicateUniqueData,
  createDeclaredIndexes,
} from '../production/indexManagement.service.js';
import { verifyCriticalIndexes } from '../production/preflight.service.js';
import logger from '../observability/logger.js';


if (env.NODE_ENV !== 'production') {
  throw new Error('Production index creation requires NODE_ENV=production');
}

let exitCode = 1;
try {
  await connectDB();
  const duplicates = await findDuplicateUniqueData(mongoose.connection.db);
  if (duplicates.length > 0) {
    process.stdout.write(`${JSON.stringify({
      event: 'production_index_creation_blocked',
      failures: duplicates,
    })}\n`);
  }
  else {
    const created = await createDeclaredIndexes();
    const failures = await verifyCriticalIndexes(mongoose.connection.db);
    process.stdout.write(`${JSON.stringify({
      event: 'production_index_creation_completed',
      collections: created.map(({ collection }) => collection),
      verificationFailures: failures,
    })}\n`);
    exitCode = failures.length === 0 ? 0 : 1;
  }
}
catch (error) {
  logger.error('production_index_creation_failed', { error });
  process.stdout.write(`${JSON.stringify({
    event: 'production_index_creation_failed',
  })}\n`);
}
finally {
  await mongoose.disconnect().catch(() => {});
  process.exitCode = exitCode;
}
