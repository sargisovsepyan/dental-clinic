import Appointment from '../modules/appointments/appointment.model.js';
import PhoneDailyQuota from '../modules/appointments/phoneDailyQuota.model.js';
import {
  assertPhoneQuotaKeyIdentity,
  currentOrLegacyPhoneQuotaKeyVersionExpression,
  exactPhoneQuotaKeyVersionExpression,
  getPhoneQuotaKey,
  getPhoneQuotaIdentityStatus,
} from '../modules/appointments/phoneDailyQuota.service.js';
import PhoneQuotaKeyIdentity from '../modules/appointments/phoneQuotaKeyIdentity.model.js';
import runTransaction from '../utils/runTransaction.js';
import env from '../config/env.js';

const version =
  '20260814_002_phone_daily_quota';

const description =
  'Backfill durable phone/day quota reservations for active appointments';

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(
  value,
  key
);


const exactField = (document, field) => (
  hasOwn(document, field)
    ? { [field]: document[field] }
    : { [field]: { $exists: false } }
);


const run = async ({
  dryRun = true,
  assertLease = async () => {},
  beforeReservationWrite,
  quotaKeyAttestation = null,
}) => {
  const stats = {
    scanned: 0,
    appointmentIdsBackfilled: 0,
    reservationsProcessed: 0,
  };

  const [
    quotaRowCount,
    foreignKeyVersionRows,
    duplicateQuotaKeyRows,
    identityStatus,
  ] =
    await Promise.all([
      PhoneDailyQuota.collection.countDocuments({}),
      PhoneDailyQuota.collection.countDocuments({
        $expr: {
          $not: [currentOrLegacyPhoneQuotaKeyVersionExpression()],
        },
      }),
      PhoneDailyQuota.collection.aggregate([
        {
          $group: {
            _id: { phoneKey: '$phoneKey', date: '$date' },
            count: { $sum: 1 },
          },
        },
        { $match: { count: { $gt: 1 } } },
        { $limit: 1 },
      ]).hasNext(),
      getPhoneQuotaIdentityStatus(),
    ]);
  if (foreignKeyVersionRows > 0) {
    throw new Error(
      'Phone quota migration found rows with a non-current keyVersion or malformed keyVersion; ' +
      'resolve quota-key ownership before applying this migration'
    );
  }
  if (duplicateQuotaKeyRows) {
    throw new Error(
      'Phone quota migration found duplicate phone/day rows; ' +
      'resolve duplicate quota ownership before applying this migration'
    );
  }
  if (identityStatus.exists && !identityStatus.matches) {
    throw new Error(
      'Persisted phone quota key identity does not match this deployment'
    );
  }

  const requiresKeyIdentityAttestation =
    !identityStatus.exists && quotaRowCount > 0;
  const keyIdentityAttestationAccepted =
    quotaKeyAttestation === env.APPOINTMENT_QUOTA_KEY_VERSION;
  if (
    !dryRun &&
    requiresKeyIdentityAttestation &&
    !keyIdentityAttestationAccepted
  ) {
    throw new Error(
      `Existing phone quota rows have unknown key identity; rerun with ` +
      `--attest-phone-quota-key-version=${env.APPOINTMENT_QUOTA_KEY_VERSION} ` +
      'only after confirming the configured secret originally hashed those rows'
    );
  }

  if (!dryRun) {
    await Promise.all([
      PhoneDailyQuota.init(),
      PhoneQuotaKeyIdentity.init(),
    ]);
    await assertPhoneQuotaKeyIdentity({
      allowExistingQuotaRows:
        requiresKeyIdentityAttestation && keyIdentityAttestationAccepted,
    });
  }

  const appointments = Appointment.collection
    .find({
      status: { $ne: 'cancelled' },
    })
    .batchSize(250);

  for await (const appointment of appointments) {
    stats.scanned += 1;

    if (dryRun) {
      if (!appointment.quotaReservationId) {
        stats.appointmentIdsBackfilled += 1;
      }
      stats.reservationsProcessed += 1;
      continue;
    }

    await assertLease();
    const outcome = await runTransaction(async (mongoSession) => {
      const current = await Appointment.collection.findOne(
        {
          _id: appointment._id,
          status: { $ne: 'cancelled' },
        },
        { session: mongoSession }
      );
      if (!current) return { processed: false, backfilled: false };

      await assertPhoneQuotaKeyIdentity({
        session: mongoSession,
        createIfMissing: false,
      });

      await beforeReservationWrite?.(current);
      const reservationId = current.quotaReservationId || current._id;
      const writeAt = new Date();
      const fenced = await Appointment.collection.updateOne(
        {
          _id: current._id,
          status: current.status,
          ...exactField(current, 'patientPhone'),
          ...exactField(current, 'date'),
          ...exactField(current, 'quotaReservationId'),
          ...exactField(current, 'updatedAt'),
        },
        {
          $set: {
            quotaReservationId: reservationId,
            updatedAt: writeAt,
          },
        },
        { session: mongoSession }
      );
      if (fenced.matchedCount !== 1) {
        throw new Error(
          'Appointment changed while backfilling its quota reservation'
        );
      }

      const phoneKey = getPhoneQuotaKey(current.patientPhone);
      const existingQuota = await PhoneDailyQuota.collection.findOne(
        { phoneKey, date: current.date },
        {
          projection: { keyVersion: 1 },
          session: mongoSession,
        }
      );
      const existingKeyVersionType = !existingQuota
        ? null
        : !hasOwn(existingQuota, 'keyVersion')
          ? 'missing'
          : existingQuota.keyVersion === null
            ? 'null'
            : typeof existingQuota.keyVersion === 'string' &&
                existingQuota.keyVersion === env.APPOINTMENT_QUOTA_KEY_VERSION
              ? 'current'
              : 'invalid';
      if (existingKeyVersionType === 'invalid') {
        throw new Error(
          'Phone quota key ownership changed during migration'
        );
      }

      let quotaId;
      let quotaOwnershipExpression;
      if (existingQuota) {
        quotaId = existingQuota._id;
        quotaOwnershipExpression = existingKeyVersionType === 'current'
          ? exactPhoneQuotaKeyVersionExpression()
          : {
              $eq: [
                { $type: '$keyVersion' },
                existingKeyVersionType,
              ],
            };
        const quotaRow = await PhoneDailyQuota.collection.updateOne(
          {
            _id: quotaId,
            $expr: quotaOwnershipExpression,
          },
          { $set: { updatedAt: writeAt } },
          { session: mongoSession }
        );
        if (quotaRow.matchedCount !== 1) {
          throw new Error(
            'Phone quota key ownership changed during migration'
          );
        }
      }
      else {
        const quotaRow = await PhoneDailyQuota.collection.insertOne(
          {
            phoneKey,
            date: current.date,
            keyVersion: env.APPOINTMENT_QUOTA_KEY_VERSION,
            reservations: [],
            createdAt: writeAt,
            updatedAt: writeAt,
          },
          { session: mongoSession }
        );
        quotaId = quotaRow.insertedId;
        quotaOwnershipExpression = exactPhoneQuotaKeyVersionExpression();
      }
      await PhoneDailyQuota.collection.updateOne(
        {
          _id: quotaId,
          $expr: quotaOwnershipExpression,
          'reservations.reservationId': { $ne: reservationId },
        },
        {
          $push: {
            reservations: {
              reservationId,
              reservedAt: current.createdAt || writeAt,
            },
          },
          $set: { updatedAt: writeAt },
        },
        { session: mongoSession }
      );
      return {
        processed: true,
        backfilled: !current.quotaReservationId,
      };
    });

    if (outcome.processed) stats.reservationsProcessed += 1;
    if (outcome.backfilled) stats.appointmentIdsBackfilled += 1;
  }

  return {
    ...stats,
    quotaRowCount,
    foreignKeyVersionRows,
    duplicateQuotaKeyRows,
    identityCreated: !dryRun && !identityStatus.exists,
    requiresKeyIdentityAttestation,
    keyIdentityAttestationAccepted,
  };
};

export {
  version,
  description,
  run,
};
