import env from '../config/env.js';
import Session from '../modules/sessions/session.model.js';
import RefreshReplayHistory from '../modules/sessions/refreshReplayHistory.model.js';
import runTransaction from '../utils/runTransaction.js';


const version =
  '20260814_005_refresh_session_lifecycle';
const description =
  'Bound refresh sessions, preserve replay history in TTL records, and revoke unverifiable legacy trust';
const REPLAY_WRITE_BATCH_SIZE = 250;


const legacyFilter = {
  $or: [
    { absoluteExpiresAt: { $exists: false } },
    { issuedAuthVersion: { $exists: false } },
    { consumedTokenHashes: { $exists: true } },
  ],
};


const addDays = (date, days) => new Date(
  date.getTime() + days * 24 * 60 * 60 * 1000
);


const validTokenHash = (value) => (
  typeof value === 'string' &&
  /^[a-f0-9]{64}$/i.test(value)
);


const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(
  value,
  key
);


const exactField = (document, field) => (
  hasOwn(document, field)
    ? { [field]: document[field] }
    : { [field]: { $exists: false } }
);


const legacySnapshotFilter = (legacy) => ({
  _id: legacy._id,
  ...exactField(legacy, 'tokenHash'),
  ...exactField(legacy, 'user'),
  ...exactField(legacy, 'familyId'),
  ...exactField(legacy, 'consumedTokenHashes'),
  ...exactField(legacy, 'issuedAuthVersion'),
  ...exactField(legacy, 'absoluteExpiresAt'),
  ...exactField(legacy, 'expiresAt'),
  ...exactField(legacy, 'revokedAt'),
  ...exactField(legacy, 'updatedAt'),
});


const run = async ({
  dryRun = true,
  assertLease = async () => {},
  afterReplayChunk,
  beforeSessionWrite,
}) => {
  const stats = {
    sessionsScanned: 0,
    sessionsRevoked: 0,
    replayHashesCopied: 0,
  };
  const cursor = Session.collection
    .find(legacyFilter, {
      projection: {
        user: 1,
        tokenHash: 1,
        familyId: 1,
        consumedTokenHashes: 1,
        issuedAuthVersion: 1,
        absoluteExpiresAt: 1,
        expiresAt: 1,
        revokedAt: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    })
    .batchSize(250);

  for await (const legacy of cursor) {
    stats.sessionsScanned += 1;

    const now = new Date();
    const createdAt = legacy.createdAt instanceof Date
      ? legacy.createdAt
      : now;
    const absoluteExpiresAt = legacy.absoluteExpiresAt instanceof Date
      ? legacy.absoluteExpiresAt
      : addDays(createdAt, env.SESSION_ABSOLUTE_TTL_DAYS);
    const existingExpiry = legacy.expiresAt instanceof Date
      ? legacy.expiresAt
      : now;
    const expiresAt = existingExpiry < absoluteExpiresAt
      ? existingExpiry
      : absoluteExpiresAt;
    const familyId = legacy.familyId || `legacy-${legacy._id}`;
    const replayHashes = absoluteExpiresAt > now
      ? [
          ...new Set(
            (legacy.consumedTokenHashes || [])
              .filter(validTokenHash)
              .map((hash) => hash.toLowerCase())
          ),
        ]
      : [];
    const trustIsUnverifiable =
      !Number.isInteger(legacy.issuedAuthVersion) ||
      !(legacy.absoluteExpiresAt instanceof Date);

    stats.replayHashesCopied += replayHashes.length;
    if (trustIsUnverifiable && !legacy.revokedAt) {
      stats.sessionsRevoked += 1;
    }

    if (dryRun) {
      continue;
    }

    for (
      let offset = 0;
      offset < replayHashes.length;
      offset += REPLAY_WRITE_BATCH_SIZE
    ) {
      const chunk = replayHashes.slice(
        offset,
        offset + REPLAY_WRITE_BATCH_SIZE
      );
      await assertLease();
      await runTransaction(async (mongoSession) => {
        await RefreshReplayHistory.collection.bulkWrite(
          chunk.map((tokenHash) => ({
            updateOne: {
              filter: { tokenHash },
              update: {
                $setOnInsert: {
                  tokenHash,
                  user: legacy.user,
                  familyId,
                  expiresAt: absoluteExpiresAt,
                  createdAt: now,
                },
              },
              upsert: true,
            },
          })),
          { session: mongoSession, ordered: false }
        );

        const persisted = await RefreshReplayHistory.collection.find(
          { tokenHash: { $in: chunk } },
          {
            session: mongoSession,
            projection: { tokenHash: 1, user: 1, familyId: 1 },
          }
        ).toArray();
        const byHash = new Map(
          persisted.map((record) => [record.tokenHash, record])
        );
        for (const tokenHash of chunk) {
          const record = byHash.get(tokenHash);
          if (
            !record ||
            String(record.user) !== String(legacy.user) ||
            record.familyId !== familyId
          ) {
            throw new Error(
              'Refresh replay migration found conflicting token ownership'
            );
          }
        }
      });
      await afterReplayChunk?.({ offset, size: chunk.length });
    }

    await assertLease();
    await beforeSessionWrite?.(legacy);
    await runTransaction(async (mongoSession) => {
      const set = {
        familyId,
        issuedAuthVersion: Number.isInteger(legacy.issuedAuthVersion)
          ? legacy.issuedAuthVersion
          : 0,
        absoluteExpiresAt,
        expiresAt,
        updatedAt: now,
      };
      if (trustIsUnverifiable && !legacy.revokedAt) {
        set.revokedAt = now;
      }

      const updated = await Session.collection.updateOne(
        legacySnapshotFilter(legacy),
        {
          $set: set,
          $unset: { consumedTokenHashes: '' },
        },
        { session: mongoSession }
      );
      if (updated.matchedCount !== 1) {
        throw new Error(
          'Refresh session changed while its legacy replay state was migrated'
        );
      }
    });
  }

  return stats;
};


export {
  version,
  description,
  run,
};
