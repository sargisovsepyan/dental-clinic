import mongoose from 'mongoose';

import connectDB from '../config/db.js';
import { runMigrations } from '../migrations/runner.js';
import { assertMaintenanceSafety } from './maintenanceGuard.js';
import { redactText } from '../observability/logger.js';

const apply = process.argv.includes('--apply');
const quotaKeyAttestation = process.argv
  .find((argument) => argument.startsWith(
    '--attest-phone-quota-key-version='
  ))
  ?.split('=', 2)[1];
const argumentValues = (prefix) => process.argv
  .filter((argument) => argument.startsWith(prefix))
  .map((argument) => argument.slice(prefix.length));
const releaseArtifact = argumentValues('--release-artifact=')[0];
const operatorId = argumentValues('--operator-id=')[0];
const legacyLedgerVersions = argumentValues(
  '--attest-legacy-ledger-version='
);

const main = async () => {
  assertMaintenanceSafety({
    requiresWriteWindow: apply,
    releaseArtifact,
    operatorId,
  });

  const legacyLocale =
    process.env.LEGACY_CONTENT_LOCALE;

  await connectDB();

  const results = await runMigrations({
    dryRun: !apply,
    legacyLocale,
    quotaKeyAttestation,
    releaseArtifact,
    legacyLedgerAttestations: Object.fromEntries(
      legacyLedgerVersions.map((version) => [version, {
        actor: operatorId,
        artifact: releaseArtifact,
      }])
    ),
  });

  for (const result of results) {
    console.log(JSON.stringify({
      migration: result.version,
      status: result.status,
      stats: result.stats,
      ledgerAttested: result.ledgerAttested,
    }));
  }
};

main()
  .catch((error) => {
    console.error(
      `Migration failed: ${redactText(error.message)}`
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
