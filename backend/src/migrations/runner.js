import Migration from '../modules/migrations/migration.model.js';

import * as localizedContent from './20260814_001_localized_content.js';

const migrations = [
  localizedContent,
];

const runMigrations = async ({
  dryRun = true,
  legacyLocale,
}) => {
  const results = [];

  for (const migration of migrations) {
    const applied = await Migration.exists({
      version: migration.version,
    });

    if (applied) {
      results.push({
        version: migration.version,
        status: 'already_applied',
      });
      continue;
    }

    const stats = await migration.run({
      dryRun,
      legacyLocale,
    });

    if (!dryRun) {
      await Migration.create({
        version: migration.version,
        description: migration.description,
        metadata: {
          legacyLocale,
          stats,
        },
      });
    }

    results.push({
      version: migration.version,
      status: dryRun ? 'dry_run' : 'applied',
      stats,
    });
  }

  return results;
};

export {
  runMigrations,
};
