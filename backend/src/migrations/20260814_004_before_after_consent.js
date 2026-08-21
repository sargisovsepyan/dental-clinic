import BeforeAfterCase from '../modules/beforeAfter/beforeAfter.model.js';
import {
  UNVERIFIED_POLICY,
} from '../modules/beforeAfter/beforeAfter.consent.js';


const version = '20260814_004_before_after_consent';
const description =
  'Quarantine legacy before/after rows with unverifiable consent history';


const legacyFilter = {
  $or: [
    { consentStatus: { $exists: false } },
    { consentPolicyVersion: { $exists: false } },
    { consentMethod: { $exists: false } },
    { publicationStatus: { $exists: false } },
  ],
};


const run = async ({ dryRun = true }) => {
  const casesScanned = await BeforeAfterCase.collection.countDocuments(
    legacyFilter
  );

  let migrated = 0;
  if (!dryRun) {
    const result = await BeforeAfterCase.collection.updateMany(
      legacyFilter,
      {
        $set: {
          publicationStatus: 'draft',
          consentStatus: 'unverified',
          consentPolicyVersion: UNVERIFIED_POLICY,
          consentMethod: 'legacy_unverified',
          externalConsentReference: '',
          isActive: false,
          isFeatured: false,
          consentHistory: [],
        },
        $unset: {
          consentRecordedBy: '',
        },
      }
    );
    migrated = result.modifiedCount;
  }

  return {
    casesScanned,
    migrated,
    policyVersion: UNVERIFIED_POLICY,
  };
};


export {
  version,
  description,
  UNVERIFIED_POLICY,
  run,
};
