import BeforeAfterCase from '../modules/beforeAfter/beforeAfter.model.js';

import {
  UNVERIFIED_POLICY,
} from '../modules/beforeAfter/beforeAfter.consent.js';


const version = '20260814_007_before_after_consent_correction';
const description =
  'Quarantine consent evidence fabricated by the original legacy migration';


const correctionState = {
  publicationStatus: 'draft',
  consentStatus: 'unverified',
  consentPolicyVersion: UNVERIFIED_POLICY,
  consentMethod: 'legacy_unverified',
  externalConsentReference: '',
  isActive: false,
  isFeatured: false,
  consentHistory: [],
};


const fabricatedOrPartialFilter = {
  $or: [
    { consentMethod: 'legacy_migrated' },
    {
      $and: [
        { consentMethod: { $exists: false } },
        {
          consentHistory: {
            $elemMatch: { method: 'legacy_migrated' },
          },
        },
      ],
    },
    {
      $and: [
        {
          $or: [
            { consentStatus: 'unverified' },
            { consentMethod: 'legacy_unverified' },
            { consentPolicyVersion: UNVERIFIED_POLICY },
          ],
        },
        {
          $or: [
            { publicationStatus: { $ne: 'draft' } },
            { consentStatus: { $ne: 'unverified' } },
            { consentPolicyVersion: { $ne: UNVERIFIED_POLICY } },
            { consentMethod: { $ne: 'legacy_unverified' } },
            { isActive: { $ne: false } },
            { isFeatured: { $ne: false } },
            { consentHistory: { $ne: [] } },
            { consentRecordedBy: { $exists: true } },
          ],
        },
      ],
    },
  ],
};


const governedFields = [
  'publicationStatus',
  'consentStatus',
  'consentPolicyVersion',
  'consentMethod',
  'externalConsentReference',
  'isActive',
  'isFeatured',
  'consentHistory',
  'consentRecordedBy',
];


const exactFieldCondition = (item, field) => (
  Object.prototype.hasOwnProperty.call(item, field)
    ? { [field]: item[field] }
    : { [field]: { $exists: false } }
);


const run = async ({ dryRun = true }) => {
  const casesScanned = await BeforeAfterCase.collection.countDocuments(
    fabricatedOrPartialFilter
  );

  let corrected = 0;
  if (!dryRun) {
    const projection = Object.fromEntries(
      governedFields.map((field) => [field, 1])
    );
    const cursor = BeforeAfterCase.collection
      .find(fabricatedOrPartialFilter, { projection })
      .batchSize(250);

    for await (const item of cursor) {
      const result = await BeforeAfterCase.collection.updateOne(
        {
          _id: item._id,
          $and: governedFields.map(
            (field) => exactFieldCondition(item, field)
          ),
        },
        {
          $set: correctionState,
          $unset: {
            consentRecordedBy: '',
          },
        }
      );
      corrected += result.modifiedCount;
    }
  }

  return {
    casesScanned,
    corrected,
    policyVersion: UNVERIFIED_POLICY,
  };
};


export {
  version,
  description,
  fabricatedOrPartialFilter,
  run,
};
