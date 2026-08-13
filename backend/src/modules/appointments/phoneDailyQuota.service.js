import crypto from 'crypto';

import Appointment from './appointment.model.js';
import PhoneDailyQuota from './phoneDailyQuota.model.js';

import env from '../../config/env.js';
import ApiError from '../../utils/ApiError.js';

const getPhoneQuotaKey = (patientPhone) => (
  crypto
    .createHmac(
      'sha256',
      env.APPOINTMENT_QUOTA_SECRET
    )
    .update(patientPhone, 'utf8')
    .digest('hex')
);

const ensureQuotaDocument = async (
  phoneKey,
  date
) => {
  await PhoneDailyQuota.init();

  try {
    await PhoneDailyQuota.updateOne(
      { phoneKey, date },
      {
        $setOnInsert: {
          phoneKey,
          date,
          reservations: [],
        },
      },
      { upsert: true }
    );
  }
  catch (error) {
    if (error?.code !== 11000) {
      throw error;
    }
  }
};

const acquirePhoneDailyQuota = async ({
  patientPhone,
  date,
  reservationId,
  limit,
  reservedAt = new Date(),
}) => {
  const phoneKey = getPhoneQuotaKey(patientPhone);

  await ensureQuotaDocument(phoneKey, date);

  const quota = await PhoneDailyQuota.findOneAndUpdate(
    {
      phoneKey,
      date,
      'reservations.reservationId': {
        $ne: reservationId,
      },
      $expr: {
        $lt: [
          {
            $size: {
              $ifNull: ['$reservations', []],
            },
          },
          limit,
        ],
      },
    },
    {
      $push: {
        reservations: {
          reservationId,
          reservedAt,
        },
      },
    },
    {
      returnDocument: 'after',
      runValidators: true,
    }
  );

  if (quota) {
    return quota;
  }

  const alreadyReserved = await PhoneDailyQuota.exists({
    phoneKey,
    date,
    'reservations.reservationId': reservationId,
  });

  if (alreadyReserved) {
    return PhoneDailyQuota.findOne({
      phoneKey,
      date,
    });
  }

  throw new ApiError(
    429,
    `Maximum number of appointments per phone for this day is ${limit}`
  );
};

const releasePhoneDailyQuota = async ({
  patientPhone,
  date,
  reservationId,
}) => {
  if (!reservationId) {
    return;
  }

  const phoneKey = getPhoneQuotaKey(patientPhone);

  await PhoneDailyQuota.updateOne(
    { phoneKey, date },
    {
      $pull: {
        reservations: { reservationId },
      },
    }
  );

  await PhoneDailyQuota.deleteOne({
    phoneKey,
    date,
    reservations: { $size: 0 },
  });
};

const addReconciledReservation = async ({
  patientPhone,
  date,
  reservationId,
  reservedAt,
}) => {
  const phoneKey = getPhoneQuotaKey(patientPhone);

  await ensureQuotaDocument(phoneKey, date);

  const result = await PhoneDailyQuota.updateOne(
    {
      phoneKey,
      date,
      'reservations.reservationId': {
        $ne: reservationId,
      },
    },
    {
      $push: {
        reservations: {
          reservationId,
          reservedAt,
        },
      },
    }
  );

  return result.modifiedCount === 1;
};

const reconcilePhoneDailyQuotas = async ({
  dryRun = true,
  staleAfterMinutes = 10,
  now = new Date(),
} = {}) => {
  const cutoff = new Date(
    now.getTime() - staleAfterMinutes * 60_000
  );
  const stats = {
    appointmentsScanned: 0,
    missingReservations: 0,
    orphanReservations: 0,
  };

  const activeAppointments = Appointment.find({
    status: { $ne: 'cancelled' },
    quotaReservationId: { $ne: null },
  })
    .select(
      'patientPhone date quotaReservationId createdAt'
    )
    .lean()
    .cursor();

  for await (const appointment of activeAppointments) {
    stats.appointmentsScanned += 1;
    const phoneKey = getPhoneQuotaKey(
      appointment.patientPhone
    );
    const exists = await PhoneDailyQuota.exists({
      phoneKey,
      date: appointment.date,
      'reservations.reservationId':
        appointment.quotaReservationId,
    });

    if (!exists) {
      stats.missingReservations += 1;

      if (!dryRun) {
        await addReconciledReservation({
          patientPhone: appointment.patientPhone,
          date: appointment.date,
          reservationId:
            appointment.quotaReservationId,
          reservedAt:
            appointment.createdAt || now,
        });
      }
    }
  }

  const quotas = PhoneDailyQuota.find()
    .select('+phoneKey')
    .lean()
    .cursor();

  for await (const quota of quotas) {
    for (const reservation of quota.reservations) {
      if (reservation.reservedAt > cutoff) {
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
        getPhoneQuotaKey(appointment.patientPhone) ===
          quota.phoneKey
      ) {
        continue;
      }

      stats.orphanReservations += 1;

      if (!dryRun) {
        await PhoneDailyQuota.updateOne(
          { _id: quota._id },
          {
            $pull: {
              reservations: {
                reservationId:
                  reservation.reservationId,
              },
            },
          }
        );
      }
    }

    if (!dryRun) {
      await PhoneDailyQuota.deleteOne({
        _id: quota._id,
        reservations: { $size: 0 },
      });
    }
  }

  return stats;
};

export {
  getPhoneQuotaKey,
  acquirePhoneDailyQuota,
  releasePhoneDailyQuota,
  reconcilePhoneDailyQuotas,
};
