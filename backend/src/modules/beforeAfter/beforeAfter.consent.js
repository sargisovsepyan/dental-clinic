const UNVERIFIED_POLICY = 'legacy-history-unverified';

const VERIFIED_CONSENT_METHODS = Object.freeze([
  'written',
  'digital',
  'verbal',
  'external',
]);

const VERIFIED_CONSENT_QUERY = Object.freeze({
  consentStatus: 'active',
  consentMethod: { $in: VERIFIED_CONSENT_METHODS },
  consentPolicyVersion: {
    $exists: true,
    $nin: [null, '', UNVERIFIED_POLICY],
  },
  consentConfirmedAt: { $exists: true, $ne: null },
  consentRecordedBy: { $exists: true, $ne: null },
});

const hasVerifiedConsent = (item) => Boolean(
  item?.consentStatus === 'active' &&
  VERIFIED_CONSENT_METHODS.includes(item?.consentMethod) &&
  item?.consentPolicyVersion &&
  item.consentPolicyVersion !== UNVERIFIED_POLICY &&
  item?.consentConfirmedAt &&
  item?.consentRecordedBy
);

export {
  UNVERIFIED_POLICY,
  VERIFIED_CONSENT_METHODS,
  VERIFIED_CONSENT_QUERY,
  hasVerifiedConsent,
};
