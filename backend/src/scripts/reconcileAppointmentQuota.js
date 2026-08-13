import mongoose from 'mongoose';

import connectDB from '../config/db.js';
import {
  reconcilePhoneDailyQuotas,
} from '../modules/appointments/phoneDailyQuota.service.js';

const apply = process.argv.includes('--apply');

const main = async () => {
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
      `Quota reconciliation failed: ${error.message}`
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
