import mongoose from 'mongoose';

import connectDB from '../config/db.js';
import {
  reconcilePhoneDailyQuotas,
} from '../modules/appointments/phoneDailyQuota.service.js';
import { assertMaintenanceSafety } from './maintenanceGuard.js';
import { redactText } from '../observability/logger.js';

const apply = process.argv.includes('--apply');

const main = async () => {
  assertMaintenanceSafety();

  await connectDB();

  const stats = await reconcilePhoneDailyQuotas({
    dryRun: !apply,
  });

  console.log(JSON.stringify({
    operation: 'appointment_phone_quota_reconcile',
    status: apply ? 'applied' : 'dry_run',
    stats,
  }));
};

main()
  .catch((error) => {
    console.error(
      `Quota reconciliation failed: ${redactText(error.message)}`
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
