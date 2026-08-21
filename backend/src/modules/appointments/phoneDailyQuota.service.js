import crypto from 'crypto';

import Appointment from './appointment.model.js';
import PhoneDailyQuota from './phoneDailyQuota.model.js';
import PhoneQuotaKeyIdentity from './phoneQuotaKeyIdentity.model.js';
import Clinic from '../clinic/clinic.model.js';

import env from '../../config/env.js';
import ApiError from '../../utils/ApiError.js';


const IDENTITY_ID = 'phone-quota-key-identity';


const exactPhoneQuotaKeyVersionExpression = () => ({
  $and: [
    { $eq: [{ $type: '$keyVersion' }, 'string'] },
    { $eq: ['$keyVersion', env.APPOINTMENT_QUOTA_KEY_VERSION] },
  ],
});


const legacyPhoneQuotaKeyVersionExpression = () => ({
  $in: [{ $type: '$keyVersion' }, ['missing', 'null']],
});


const currentOrLegacyPhoneQuotaKeyVersionExpression = () => ({
  $or: [
    exactPhoneQuotaKeyVersionExpression(),
    legacyPhoneQuotaKeyVersionExpression(),
  ],
});


const initializePhoneQuotaInfrastructure = async () => {
  await Promise.all([
    PhoneDailyQuota.init(),
    PhoneQuotaKeyIdentity.init(),
  ]);
};


const getPhoneQuotaKey = (patientPhone) => (
  crypto
    .createHmac(
      'sha256',
      env.APPOINTMENT_QUOTA_SECRET
    )
    .update(patientPhone, 'utf8')
    .digest('hex')
);


const getPhoneQuotaSecretFingerprint = () => (
  crypto
    .createHash('sha256')
    .update('appointment-phone-quota\0', 'utf8')
    .update(env.APPOINTMENT_QUOTA_SECRET, 'utf8')
    .digest('hex')
);


const getPhoneQuotaIdentityStatus = async ({ session = null } = {}) => {
  const query = PhoneQuotaKeyIdentity.findById(IDENTITY_ID)
    .select('+secretFingerprint')
    .lean();
  if (session) {
    query.session(session);
  }
  const identity = await query;
  const expectedFingerprint = getPhoneQuotaSecretFingerprint();

  return {
    exists: Boolean(identity),
    matches: Boolean(
      identity &&
      identity.keyVersion === env.APPOINTMENT_QUOTA_KEY_VERSION &&
      identity.secretFingerprint === expectedFingerprint
    ),
    actualVersion: identity?.keyVersion || null,
    expectedVersion: env.APPOINTMENT_QUOTA_KEY_VERSION,
  };
};


const assertPhoneQuotaKeyIdentity = async ({
  session = null,
  createIfMissing = true,
  allowExistingQuotaRows = false,
} = {}) => {
  const secretFingerprint = getPhoneQuotaSecretFingerprint();
  const initialStatus = await getPhoneQuotaIdentityStatus({ session });

  if (initialStatus.matches) {
    return initialStatus;
  }
  if (initialStatus.exists || !createIfMissing) {
    throw new ApiError(
      503,
      'Appointment quota key identity does not match persisted data; run the explicit rotation migration before admitting bookings'
    );
  }

  const legacyQuotaQuery = PhoneDailyQuota.exists({});
  if (session) {
    legacyQuotaQuery.session(session);
  }
  if ((await legacyQuotaQuery) && !allowExistingQuotaRows) {
    throw new ApiError(
      503,
      'Appointment quota rows have no attested key identity; run the explicit identity migration before admitting bookings'
    );
  }

  if (createIfMissing) {
    try {
      await PhoneQuotaKeyIdentity.updateOne(
        {
          _id: IDENTITY_ID,
          keyVersion: env.APPOINTMENT_QUOTA_KEY_VERSION,
          secretFingerprint,
        },
        {
          $setOnInsert: {
            _id: IDENTITY_ID,
            keyVersion: env.APPOINTMENT_QUOTA_KEY_VERSION,
            secretFingerprint,
          },
        },
        { upsert: true, session }
      );
    }
    catch (error) {
      if (error?.code !== 11000) {
        throw error;
      }
    }
  }

  const status = await getPhoneQuotaIdentityStatus({ session });
  if (!status.matches) {
    throw new ApiError(
      503,
      'Appointment quota key identity does not match persisted data; run the explicit rotation migration before admitting bookings'
    );
  }

  return status;
};


const ensureQuotaDocument = async (
  phoneKey,
  date,
  session = null
) => {
  const findQuota = () => PhoneDailyQuota.collection.findOne(
    { phoneKey, date },
    {
      projection: { keyVersion: 1 },
      session,
    }
  );
  const assertExactKeyVersion = (quota) => {
    if (
      quota &&
      (
        typeof quota.keyVersion !== 'string' ||
        quota.keyVersion !== env.APPOINTMENT_QUOTA_KEY_VERSION
      )
    ) {
      throw new ApiError(
        503,
        'Appointment quota row uses a different or malformed key version'
      );
    }
  };

  const existing = await findQuota();
  if (existing) {
    assertExactKeyVersion(existing);
    return;
  }

  try {
    const writeAt = new Date();
    await PhoneDailyQuota.collection.insertOne(
      {
        phoneKey,
        date,
        keyVersion: env.APPOINTMENT_QUOTA_KEY_VERSION,
        reservations: [],
        createdAt: writeAt,
        updatedAt: writeAt,
      },
      { session }
    );
  }
  catch (error) {
    if (error?.code !== 11000) {
      throw error;
    }

    const conflicting = await findQuota();
    if (!conflicting) {
      throw error;
    }
    assertExactKeyVersion(conflicting);
  }
};


const acquirePhoneDailyQuota = async ({
  patientPhone,
  date,
  reservationId,
  limit,
  reservedAt = new Date(),
  session = null,
}) => {
  await assertPhoneQuotaKeyIdentity({ session });
  const phoneKey = getPhoneQuotaKey(patientPhone);
  await ensureQuotaDocument(phoneKey, date, session);

  const quota = await PhoneDailyQuota.findOneAndUpdate(
    {
      phoneKey,
      date,
      keyVersion: env.APPOINTMENT_QUOTA_KEY_VERSION,
      'reservations.reservationId': { $ne: reservationId },
      $expr: {
        $and: [
          exactPhoneQuotaKeyVersionExpression(),
          {
            $lt: [
              { $size: { $ifNull: ['$reservations', []] } },
              limit,
            ],
          },
        ],
      },
    },
    {
      $push: {
        reservations: { reservationId, reservedAt },
      },
    },
    {
      returnDocument: 'after',
      runValidators: true,
      session,
    }
  );

  if (quota) {
    return quota;
  }

  const alreadyReserved = await PhoneDailyQuota.exists({
    phoneKey,
    date,
    keyVersion: env.APPOINTMENT_QUOTA_KEY_VERSION,
    'reservations.reservationId': reservationId,
    $expr: exactPhoneQuotaKeyVersionExpression(),
  }).session(session);

  if (alreadyReserved) {
    return PhoneDailyQuota.findOne({
      phoneKey,
      date,
      keyVersion: env.APPOINTMENT_QUOTA_KEY_VERSION,
      $expr: exactPhoneQuotaKeyVersionExpression(),
    }).session(session);
  }

  throw new ApiError(
    429,
    `Maximum number of appointments per phone for this day is ${limit}`
  );
};


const releasePhoneDailyQuota = async ({
  reservationId,
  session = null,
}) => {
  if (!reservationId) {
    return;
  }

  const matchingRows = await PhoneDailyQuota.find({
    'reservations.reservationId': reservationId,
  })
    .select('_id')
    .session(session)
    .lean();
  const rowIds = matchingRows.map(({ _id }) => _id);
  if (rowIds.length === 0) {
    return;
  }

  await PhoneDailyQuota.updateMany(
    { _id: { $in: rowIds } },
    { $pull: { reservations: { reservationId } } },
    { session }
  );

  await PhoneDailyQuota.deleteMany({
    _id: { $in: rowIds },
    reservations: { $size: 0 },
  }).session(session);
};


const addReconciledReservation = async ({
  patientPhone,
  date,
  reservationId,
  reservedAt,
  limit,
}) => {
  const phoneKey = getPhoneQuotaKey(patientPhone);
  await ensureQuotaDocument(phoneKey, date);

  const result = await PhoneDailyQuota.updateOne(
    {
      phoneKey,
      date,
      keyVersion: env.APPOINTMENT_QUOTA_KEY_VERSION,
      'reservations.reservationId': { $ne: reservationId },
      $expr: {
        $and: [
          exactPhoneQuotaKeyVersionExpression(),
          {
            $lt: [
              { $size: { $ifNull: ['$reservations', []] } },
              limit,
            ],
          },
        ],
      },
    },
    {
      $push: {
        reservations: { reservationId, reservedAt },
      },
    }
  );

  return result.modifiedCount === 1;
};


const reconcilePhoneDailyQuotas = async ({
  dryRun = true,
  staleAfterMinutes = 10,
  now = new Date(),
  includeLiveOrphans = false,
} = {}) => {
  if (!dryRun) {
    await assertPhoneQuotaKeyIdentity();
  }

  const clinic = await Clinic.findOne({ key: 'default' })
    .select('bookingSettings.maxAppointmentsPerPhonePerDay')
    .lean();
  const limit = clinic?.bookingSettings?.maxAppointmentsPerPhonePerDay;
  if (!Number.isInteger(limit)) {
    throw new Error('Clinic phone quota limit is not configured');
  }

  const cutoff = new Date(
    now.getTime() - staleAfterMinutes * 60_000
  );
  const stats = {
    appointmentsScanned: 0,
    invalidAppointmentReferences: 0,
    missingReservations: 0,
    repairConflicts: 0,
    orphanReservations: 0,
    keyVersionMismatches: 0,
    invalidQuotaRows: 0,
  };

  const activeAppointments = Appointment.find({
    status: { $ne: 'cancelled' },
    quotaReservationId: { $ne: null },
  })
    .select('patientPhone date quotaReservationId createdAt')
    .lean()
    .cursor();

  for await (const appointment of activeAppointments) {
    stats.appointmentsScanned += 1;
    if (
      typeof appointment.patientPhone !== 'string' ||
      appointment.patientPhone.length === 0 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(String(appointment.date || '')) ||
      !appointment.quotaReservationId
    ) {
      stats.invalidAppointmentReferences += 1;
      continue;
    }
    const phoneKey = getPhoneQuotaKey(appointment.patientPhone);
    const exists = await PhoneDailyQuota.exists({
      phoneKey,
      date: appointment.date,
      keyVersion: env.APPOINTMENT_QUOTA_KEY_VERSION,
      'reservations.reservationId': appointment.quotaReservationId,
      $expr: exactPhoneQuotaKeyVersionExpression(),
    });

    if (!exists) {
      stats.missingReservations += 1;

      if (!dryRun) {
        const repaired = await addReconciledReservation({
          patientPhone: appointment.patientPhone,
          date: appointment.date,
          reservationId: appointment.quotaReservationId,
          reservedAt: appointment.createdAt || now,
          limit,
        });
        if (!repaired) {
          stats.repairConflicts += 1;
        }
      }
    }
  }

  const quotas = PhoneDailyQuota.find()
    .select('+phoneKey')
    .lean()
    .cursor();

  for await (const quota of quotas) {
    if (!Array.isArray(quota.reservations)) {
      stats.invalidQuotaRows += 1;
      continue;
    }
    if (quota.keyVersion !== env.APPOINTMENT_QUOTA_KEY_VERSION) {
      stats.keyVersionMismatches += 1;
      continue;
    }

    for (const reservation of quota.reservations) {
      if (!includeLiveOrphans && reservation.reservedAt > cutoff) {
        continue;
      }

      const appointment = await Appointment.findOne({
        quotaReservationId: reservation.reservationId,
        date: quota.date,
        status: { $ne: 'cancelled' },
      })
        .select('patientPhone')
        .lean();

      if (
        appointment &&
        getPhoneQuotaKey(appointment.patientPhone) === quota.phoneKey
      ) {
        continue;
      }

      stats.orphanReservations += 1;
    }
  }

  return stats;
};


export {
  initializePhoneQuotaInfrastructure,
  getPhoneQuotaKey,
  getPhoneQuotaSecretFingerprint,
  getPhoneQuotaIdentityStatus,
  exactPhoneQuotaKeyVersionExpression,
  legacyPhoneQuotaKeyVersionExpression,
  currentOrLegacyPhoneQuotaKeyVersionExpression,
  assertPhoneQuotaKeyIdentity,
  acquirePhoneDailyQuota,
  releasePhoneDailyQuota,
  reconcilePhoneDailyQuotas,
};
