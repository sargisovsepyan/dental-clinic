import Appointment from '../modules/appointments/appointment.model.js';
import PhoneDailyQuota from '../modules/appointments/phoneDailyQuota.model.js';
import {
  getPhoneQuotaKey,
} from '../modules/appointments/phoneDailyQuota.service.js';

const version =
  '20260814_002_phone_daily_quota';

const description =
  'Backfill durable phone/day quota reservations for active appointments';

const run = async ({ dryRun = true }) => {
  const stats = {
    scanned: 0,
    appointmentIdsBackfilled: 0,
    reservationsProcessed: 0,
  };

  if (!dryRun) {
    await PhoneDailyQuota.init();
  }

  const appointments = Appointment.collection
    .find({
      status: { $ne: 'cancelled' },
    })
    .batchSize(250);

  for await (const appointment of appointments) {
    stats.scanned += 1;

    let reservationId =
      appointment.quotaReservationId ||
      appointment._id;

    if (!appointment.quotaReservationId) {
      stats.appointmentIdsBackfilled += 1;

      if (!dryRun) {
        const updateResult =
          await Appointment.collection.updateOne(
          {
            _id: appointment._id,
            $or: [
              { quotaReservationId: null },
              {
                quotaReservationId: {
                  $exists: false,
                },
              },
            ],
          },
          {
            $set: { quotaReservationId: reservationId },
          }
          );

        if (updateResult.modifiedCount === 0) {
          const latest =
            await Appointment.collection.findOne(
              { _id: appointment._id },
              { projection: { quotaReservationId: 1 } }
            );

          reservationId =
            latest?.quotaReservationId ||
            reservationId;
        }
      }
    }

    stats.reservationsProcessed += 1;

    if (dryRun) {
      continue;
    }

    const phoneKey = getPhoneQuotaKey(
      appointment.patientPhone
    );

    await PhoneDailyQuota.collection.updateOne(
      { phoneKey, date: appointment.date },
      {
        $setOnInsert: {
          phoneKey,
          date: appointment.date,
          reservations: [],
          createdAt: new Date(),
        },
        $set: { updatedAt: new Date() },
      },
      { upsert: true }
    );

    await PhoneDailyQuota.collection.updateOne(
      {
        phoneKey,
        date: appointment.date,
        'reservations.reservationId': {
          $ne: reservationId,
        },
      },
      {
        $push: {
          reservations: {
            reservationId,
            reservedAt:
              appointment.createdAt ||
              new Date(),
          },
        },
        $set: { updatedAt: new Date() },
      }
    );
  }

  return stats;
};

export {
  version,
  description,
  run,
};
