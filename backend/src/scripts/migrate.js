import mongoose from 'mongoose';

import connectDB from '../config/db.js';
import { runMigrations } from '../migrations/runner.js';

const apply = process.argv.includes('--apply');

const main = async () => {
  const legacyLocale =
    process.env.LEGACY_CONTENT_LOCALE;

  await connectDB();

  const results = await runMigrations({
    dryRun: !apply,
    legacyLocale,
  });

  for (const result of results) {
    console.log(JSON.stringify({
      migration: result.version,
      status: result.status,
      stats: result.stats,
    }));
  }
};

main()
  .catch((error) => {
    console.error(
      `Migration failed: ${error.message}`
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
