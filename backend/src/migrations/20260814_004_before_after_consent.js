import BeforeAfterCase from '../modules/beforeAfter/beforeAfter.model.js';
import env from '../config/env.js';


const version = '20260814_004_before_after_consent';
const description =
  'Backfill explicit before/after publication consent governance fields';


const legacyFilter = {
  $or: [
    { consentStatus: { $exists: false } },
    { consentPolicyVersion: { $exists: false } },
    { consentMethod: { $exists: false } },
    { consentRecordedBy: { $exists: false } },
    { publicationStatus: { $exists: false } },
  ],
};


const run = async ({ dryRun = true }) => {
  const casesScanned = await BeforeAfterCase.collection.countDocuments(
    legacyFilter
  );

  let migrated = 0;
  if (!dryRun) {
    const cursor = BeforeAfterCase.collection
      .find(legacyFilter, {
        projection: {
          _id: 1,
          isActive: 1,
          createdBy: 1,
          consentConfirmedAt: 1,
        },
      })
      .batchSize(250);

    for await (const item of cursor) {
      if (!item.createdBy) {
        throw new Error(
          `Before/after case ${item._id} has no actor for consent migration`
        );
      }
      const occurredAt = item.consentConfirmedAt || new Date();
      const result = await BeforeAfterCase.collection.updateOne(
        {
          _id: item._id,
          ...legacyFilter,
        },
        {
          $set: {
            publicationStatus: item.isActive === false ? 'draft' : 'published',
            consentStatus: 'active',
            consentPolicyVersion: env.BEFORE_AFTER_CONSENT_VERSION,
            consentMethod: 'legacy_migrated',
            consentRecordedBy: item.createdBy,
            externalConsentReference: '',
            withdrawnAt: null,
            withdrawnBy: null,
            withdrawalReason: '',
            purgedAt: null,
            purgedBy: null,
            consentHistory: [{
              action: 'confirmed',
              policyVersion: env.BEFORE_AFTER_CONSENT_VERSION,
              method: 'legacy_migrated',
              actor: item.createdBy,
              occurredAt,
              reason: '',
            }],
          },
        }
      );
      migrated += result.modifiedCount;
    }
  }

  return {
    casesScanned,
    migrated,
    policyVersion: env.BEFORE_AFTER_CONSENT_VERSION,
  };
};


export { version, description, run };
