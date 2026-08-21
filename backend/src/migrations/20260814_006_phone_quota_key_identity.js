import Appointment from '../modules/appointments/appointment.model.js';
import PhoneDailyQuota from '../modules/appointments/phoneDailyQuota.model.js';
import PhoneQuotaKeyIdentity from '../modules/appointments/phoneQuotaKeyIdentity.model.js';
import {
  assertPhoneQuotaKeyIdentity,
  currentOrLegacyPhoneQuotaKeyVersionExpression,
  getPhoneQuotaIdentityStatus,
  legacyPhoneQuotaKeyVersionExpression,
} from '../modules/appointments/phoneDailyQuota.service.js';
import env from '../config/env.js';


const version = '20260814_006_phone_quota_key_identity';
const description =
  'Bind phone quota rows to an explicit key identity, initialize mutation revisions, and quarantine unversioned legacy booking consent';


const run = async ({
  dryRun = true,
  quotaKeyAttestation = null,
}) => {
  const [
    quotaRowCount,
    quotaRowsMissingVersion,
    quotaRowsWithOtherVersion,
    appointmentsMissingMutationVersion,
    appointmentsWithUnversionedPrivacyConsent,
    identityStatus,
  ] = await Promise.all([
    PhoneDailyQuota.collection.countDocuments({}),
    PhoneDailyQuota.collection.countDocuments({
      $expr: legacyPhoneQuotaKeyVersionExpression(),
    }),
    PhoneDailyQuota.collection.countDocuments({
      $expr: {
        $not: [currentOrLegacyPhoneQuotaKeyVersionExpression()],
      },
    }),
    Appointment.collection.countDocuments({
      mutationVersion: { $exists: false },
    }),
    Appointment.collection.countDocuments({
      $or: [
        { privacyPolicyVersion: { $exists: false } },
        { privacyPolicyVersion: null },
        { privacyPolicyVersion: '' },
      ],
    }),
    getPhoneQuotaIdentityStatus(),
  ]);

  if (quotaRowsWithOtherVersion > 0) {
    throw new Error(
      'Phone quota rows already use another key version; stop booking and run an explicit rekey migration'
    );
  }
  if (identityStatus.exists && !identityStatus.matches) {
    throw new Error(
      'Persisted phone quota key identity does not match this deployment'
    );
  }

  const requiresKeyIdentityAttestation = Boolean(
    quotaRowsMissingVersion > 0 ||
    (!identityStatus.exists && quotaRowCount > 0)
  );
  const keyIdentityAttestationAccepted =
    quotaKeyAttestation === env.APPOINTMENT_QUOTA_KEY_VERSION;

  if (
    !dryRun &&
    requiresKeyIdentityAttestation &&
    !keyIdentityAttestationAccepted
  ) {
    throw new Error(
      `Existing phone quota rows have unknown key identity; rerun with --attest-phone-quota-key-version=${env.APPOINTMENT_QUOTA_KEY_VERSION} only after confirming the configured secret originally hashed those rows`
    );
  }

  if (!dryRun) {
    await PhoneQuotaKeyIdentity.init();
    await assertPhoneQuotaKeyIdentity({
      allowExistingQuotaRows:
        requiresKeyIdentityAttestation &&
        keyIdentityAttestationAccepted,
    });
    await PhoneDailyQuota.collection.updateMany(
      {
        $expr: legacyPhoneQuotaKeyVersionExpression(),
      },
      { $set: { keyVersion: env.APPOINTMENT_QUOTA_KEY_VERSION } }
    );
    await Appointment.collection.updateMany(
      { mutationVersion: { $exists: false } },
      { $set: { mutationVersion: 0 } }
    );
    await Appointment.collection.updateMany(
      {
        $or: [
          { privacyPolicyVersion: { $exists: false } },
          { privacyPolicyVersion: null },
          { privacyPolicyVersion: '' },
        ],
      },
      { $set: { privacyPolicyVersion: 'legacy-unverified' } }
    );
  }

  return {
    quotaRowCount,
    quotaRowsMissingVersion,
    quotaRowsWithOtherVersion,
    appointmentsMissingMutationVersion,
    appointmentsWithUnversionedPrivacyConsent,
    identityCreated: !identityStatus.exists,
    keyVersion: env.APPOINTMENT_QUOTA_KEY_VERSION,
    requiresKeyIdentityAttestation,
    keyIdentityAttestationAccepted,
  };
};


export { version, description, run };
