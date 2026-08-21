import crypto from 'crypto';
import { readFileSync } from 'node:fs';

import Migration from '../modules/migrations/migration.model.js';
import RefreshReplayHistory from '../modules/sessions/refreshReplayHistory.model.js';
import BookingIdempotency from '../modules/appointments/bookingIdempotency.model.js';

import * as localizedContent from './20260814_001_localized_content.js';
import * as phoneDailyQuota from './20260814_002_phone_daily_quota.js';
import * as authSecurityFields from './20260814_003_auth_security_fields.js';
import * as beforeAfterConsent from './20260814_004_before_after_consent.js';
import * as refreshSessionLifecycle from './20260814_005_refresh_session_lifecycle.js';
import * as phoneQuotaKeyIdentity from './20260814_006_phone_quota_key_identity.js';
import * as beforeAfterConsentCorrection from './20260814_007_before_after_consent_correction.js';
import * as bookingIdempotencyRecords from './20260814_008_booking_idempotency_records.js';
import * as scheduleRevisions from './20260814_009_schedule_revisions.js';
import * as removeCancellationNotice from './20260814_010_remove_cancellation_notice.js';

const withSource = (migration, relativePath) => ({
  ...migration,
  source: readFileSync(new URL(relativePath, import.meta.url), 'utf8')
    .replace(/\r\n/g, '\n'),
});

const migrations = [
  [localizedContent, './20260814_001_localized_content.js'],
  [phoneDailyQuota, './20260814_002_phone_daily_quota.js'],
  [authSecurityFields, './20260814_003_auth_security_fields.js'],
  [beforeAfterConsent, './20260814_004_before_after_consent.js'],
  [refreshSessionLifecycle, './20260814_005_refresh_session_lifecycle.js'],
  [phoneQuotaKeyIdentity, './20260814_006_phone_quota_key_identity.js'],
  [beforeAfterConsentCorrection, './20260814_007_before_after_consent_correction.js'],
  [bookingIdempotencyRecords, './20260814_008_booking_idempotency_records.js'],
  [scheduleRevisions, './20260814_009_schedule_revisions.js'],
  [removeCancellationNotice, './20260814_010_remove_cancellation_notice.js'],
].map(([migration, source]) => withSource(migration, source));

const migrationManifest = Object.freeze(
  migrations.map((migration) => ({
    version: migration.version,
    description: migration.description,
    checksum: migrationChecksum(migration),
  }))
);

const DEFAULT_LEASE_MS = 2 * 60 * 1000;
const PREREQUISITE_INDEXES = Object.freeze([
  { model: Migration, key: { version: 1 }, type: 'unique' },
  { model: RefreshReplayHistory, key: { tokenHash: 1 }, type: 'unique' },
  { model: BookingIdempotency, key: { keyHash: 1 }, type: 'unique' },
  { model: BookingIdempotency, key: { expiresAt: 1 }, type: 'ttl' },
]);

function migrationChecksum({ version, description, run, source }) {
  return crypto
    .createHash('sha256')
    .update(`${version}\u0000${description}\u0000${source || run.toString()}`)
    .digest('hex');
}

const indexKeysEqual = (left, right) => (
  JSON.stringify(left) === JSON.stringify(right)
);

const isUnconditionalUniqueIndex = (index) => Boolean(
  index &&
  index.unique === true &&
  index.sparse !== true &&
  index.hidden !== true &&
  index.partialFilterExpression === undefined &&
  index.collation === undefined &&
  index.expireAfterSeconds === undefined
);

const isExactTtlIndex = (index) => Boolean(
  index &&
  index.unique !== true &&
  index.sparse !== true &&
  index.hidden !== true &&
  index.partialFilterExpression === undefined &&
  index.collation === undefined &&
  Number(index.expireAfterSeconds) === 0
);

const isSafePrerequisiteIndex = (index, type) => (
  type === 'ttl'
    ? isExactTtlIndex(index)
    : isUnconditionalUniqueIndex(index)
);

const listIndexes = async (collection) => {
  try {
    return await collection.listIndexes().toArray();
  }
  catch (error) {
    if (error?.code === 26 || error?.codeName === 'NamespaceNotFound') {
      return [];
    }
    throw error;
  }
};

const ensureMigrationPrerequisiteIndexes = async () => {
  for (const { model, key, type } of PREREQUISITE_INDEXES) {
    const existing = (await listIndexes(model.collection))
      .find((index) => indexKeysEqual(index.key, key));
    if (existing && !isSafePrerequisiteIndex(existing, type)) {
      throw new Error(
        `Migration prerequisite index on ${model.collection.collectionName} has unsafe options`
      );
    }
    if (!existing) {
      await model.collection.createIndex(
        key,
        type === 'ttl' ? { expireAfterSeconds: 0 } : { unique: true }
      );
    }
    const verified = (await listIndexes(model.collection))
      .find((index) => indexKeysEqual(index.key, key));
    if (!isSafePrerequisiteIndex(verified, type)) {
      throw new Error(
        `Migration prerequisite ${type} index on ${model.collection.collectionName} is unavailable`
      );
    }
  }
};

const safeFailure = (error) => `${String(error?.name || 'Error')}: execution failed`
  .slice(0, 500);

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(
  value || {},
  key
);

const isLegacyApplied = (record) => Boolean(
  record &&
  !hasOwn(record, 'state') &&
  !hasOwn(record, 'checksum') &&
  record.appliedAt instanceof Date
);

const assertLedgerShape = (record, version) => {
  if (!record) return;
  if (isLegacyApplied(record)) return;
  if (!['running', 'failed', 'applied'].includes(record.state)) {
    throw new Error(`Migration ${version} has an invalid ledger state`);
  }
  if (!/^[a-f0-9]{64}$/.test(record.checksum || '')) {
    throw new Error(`Migration ${version} has an invalid ledger checksum`);
  }
  if (record.state === 'applied' && !(record.appliedAt instanceof Date)) {
    throw new Error(`Migration ${version} is missing its applied timestamp`);
  }
};

const isApplied = (record) => record?.state === 'applied';

const assertChecksum = (record, checksum, version) => {
  if (record?.checksum && record.checksum !== checksum) {
    throw new Error(
      `Migration ${version} checksum differs from the recorded applied code`
    );
  }
};

const claimMigration = async ({
  migration,
  checksum,
  ownerToken,
  now,
  leaseMs,
}) => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const record = await Migration.collection.findOne({
      version: migration.version,
    });

    assertLedgerShape(record, migration.version);
    assertChecksum(record, checksum, migration.version);
    if (isApplied(record)) {
      return { status: 'already_applied', record };
    }
    if (
      record?.state === 'running' &&
      record.leaseExpiresAt instanceof Date &&
      record.leaseExpiresAt > now
    ) {
      throw new Error(
        `Migration ${migration.version} is already running under an active lease`
      );
    }

    const leaseExpiresAt = new Date(now.getTime() + leaseMs);
    if (!record) {
      try {
        const created = await Migration.create({
          version: migration.version,
          description: migration.description,
          checksum,
          state: 'running',
          ownerToken,
          leaseExpiresAt,
          attempts: 1,
          lastStartedAt: now,
        });
        return { status: 'claimed', record: created };
      }
      catch (error) {
        if (error?.code === 11000) {
          continue;
        }
        throw error;
      }
    }

    const claimFilter = {
      _id: record._id,
      state: record.state,
    };
    if (record.state === 'running') {
      claimFilter.leaseExpiresAt = record.leaseExpiresAt;
    }
    const claimed = await Migration.findOneAndUpdate(
      claimFilter,
      {
        $set: {
          description: migration.description,
          checksum,
          state: 'running',
          ownerToken,
          leaseExpiresAt,
          lastStartedAt: now,
        },
        $inc: { attempts: 1 },
        $unset: { lastFailure: '' },
      },
      { returnDocument: 'after' }
    ).select('+ownerToken');
    if (claimed) {
      return { status: 'claimed', record: claimed };
    }
  }

  throw new Error(
    `Migration ${migration.version} changed while acquiring its lease`
  );
};

const runWithLease = async ({
  migration,
  ownerToken,
  leaseMs,
  runOptions,
}) => {
  let heartbeatFailure = null;
  let heartbeatInFlight = null;
  const refreshLease = async () => {
    if (heartbeatFailure) return;
    if (heartbeatInFlight) {
      await heartbeatInFlight;
      return;
    }
    const operation = (async () => {
      try {
        const refreshed = await Migration.updateOne(
          {
            version: migration.version,
            state: 'running',
            ownerToken,
          },
          {
            $set: {
              leaseExpiresAt: new Date(Date.now() + leaseMs),
            },
          }
        );
        if (refreshed.matchedCount !== 1) {
          heartbeatFailure = new Error(
            `Migration ${migration.version} lost its execution lease`
          );
        }
      }
      catch (error) {
        heartbeatFailure = error;
      }
    })();
    heartbeatInFlight = operation;
    try {
      await operation;
    }
    finally {
      if (heartbeatInFlight === operation) heartbeatInFlight = null;
    }
  };
  const heartbeat = setInterval(
    () => { void refreshLease(); },
    Math.max(25, Math.floor(leaseMs / 3))
  );
  heartbeat.unref?.();

  const assertLease = async () => {
    await refreshLease();
    if (heartbeatFailure) throw heartbeatFailure;
  };

  try {
    await assertLease();
    const stats = await migration.run({ ...runOptions, assertLease });
    await assertLease();
    return stats;
  }
  finally {
    clearInterval(heartbeat);
  }
};

const runMigrations = async ({
  dryRun = true,
  legacyLocale,
  quotaKeyAttestation,
  legacyLedgerAttestations = {},
  releaseArtifact,
  migrationSet = migrations,
  leaseMs = DEFAULT_LEASE_MS,
  now = () => new Date(),
}) => {
  const results = [];

  if (!dryRun) {
    await ensureMigrationPrerequisiteIndexes();
  }

  for (const migration of migrationSet) {
    const checksum = migrationChecksum(migration);
    const existing = await Migration.collection.findOne({
      version: migration.version,
    });
    assertLedgerShape(existing, migration.version);
    assertChecksum(existing, checksum, migration.version);

    if (isApplied(existing) || isLegacyApplied(existing)) {
      if (isLegacyApplied(existing)) {
        const attestation = legacyLedgerAttestations[migration.version];
        if (dryRun) {
          results.push({
            version: migration.version,
            status: 'ledger_attestation_required',
          });
          continue;
        }
        if (!attestation?.actor || !attestation?.artifact) {
          throw new Error(
            `Migration ${migration.version} requires explicit legacy ledger attestation`
          );
        }
        const attestedAt = now();
        const upgraded = await Migration.updateOne(
          {
            _id: existing._id,
            state: { $exists: false },
            checksum: { $exists: false },
            appliedAt: existing.appliedAt,
          },
          {
            $set: {
              checksum,
              state: 'applied',
              description: migration.description,
              attempts: 0,
              'metadata.legacyLedgerAttestation': {
                actor: attestation.actor,
                artifact: attestation.artifact,
                attestedAt,
              },
            },
          }
        );
        if (upgraded.modifiedCount !== 1) {
          throw new Error(
            `Migration ${migration.version} changed during ledger attestation`
          );
        }
        results.push({
          version: migration.version,
          status: 'already_applied',
          ledgerAttested: true,
        });
        continue;
      }
      results.push({
        version: migration.version,
        status: 'already_applied',
      });
      continue;
    }

    const runOptions = {
      dryRun,
      legacyLocale,
      quotaKeyAttestation,
    };
    if (dryRun) {
      const stats = await migration.run(runOptions);
      results.push({
        version: migration.version,
        status: 'dry_run',
        stats,
      });
      continue;
    }

    const ownerToken = crypto.randomUUID();
    const claimed = await claimMigration({
      migration,
      checksum,
      ownerToken,
      now: now(),
      leaseMs,
    });
    if (claimed.status === 'already_applied') {
      results.push({ version: migration.version, status: 'already_applied' });
      continue;
    }

    let stats;
    try {
      stats = await runWithLease({
        migration,
        ownerToken,
        leaseMs,
        runOptions,
      });
      const applied = await Migration.updateOne(
        {
          version: migration.version,
          state: 'running',
          ownerToken,
        },
        {
          $set: {
            state: 'applied',
            appliedAt: now(),
            metadata: {
              legacyLocale,
              quotaKeyAttestation,
              releaseArtifact,
              stats,
            },
          },
          $unset: {
            ownerToken: '',
            leaseExpiresAt: '',
            lastFailure: '',
          },
        }
      );
      if (applied.matchedCount !== 1) {
        throw new Error(
          `Migration ${migration.version} lost its execution lease before commit`
        );
      }
    }
    catch (error) {
      await Migration.updateOne(
        {
          version: migration.version,
          state: 'running',
          ownerToken,
        },
        {
          $set: {
            state: 'failed',
            lastFailure: safeFailure(error),
          },
          $unset: { ownerToken: '', leaseExpiresAt: '' },
        }
      );
      throw error;
    }

    results.push({ version: migration.version, status: 'applied', stats });
  }

  return results;
};

export {
  runMigrations,
  migrationManifest,
  migrationChecksum,
  ensureMigrationPrerequisiteIndexes,
};
