import mongoose from 'mongoose';

import env, { mongoOptions } from '../config/env.js';
import { withDeadline } from '../infrastructure/deadline.js';
import {
  verifyMongoGuarantees,
  verifyCriticalIndexes,
  verifyMigrationLedger,
} from './preflight.service.js';

// Read-only, cheap prerequisites; never run migrations or index repair at startup.
// The complete (drained-write-window) preflight remains an explicit operator action.
const checkStartupPrerequisites = async ({
  connection = mongoose.connection,
  environment = env,
  topologyCheck = verifyMongoGuarantees,
  indexCheck = verifyCriticalIndexes,
  migrationCheck = verifyMigrationLedger,
  timeoutMs = 15000,
} = {}) => {
  if (environment.NODE_ENV !== 'production') return;
  const checks = async () => {
    if (connection.readyState !== 1 || !connection.db ||
        connection.name !== mongoOptions(environment.MONGO_URI).dbName) {
      throw new Error('Production database identity/connectivity check failed');
    }
    const topology = await topologyCheck(connection.db);
    const indexes = await indexCheck(connection.db);
    const migrations = await migrationCheck();
    if (!topology.ok || indexes.length || !migrations.ok) {
      throw new Error('Production MongoDB prerequisites failed; run explicit preflight');
    }
  };
  await withDeadline(checks(), timeoutMs, 'Production prerequisite checks timed out');
};

export { checkStartupPrerequisites };
