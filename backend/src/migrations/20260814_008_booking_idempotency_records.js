import Appointment from '../modules/appointments/appointment.model.js';
import BookingIdempotency from '../modules/appointments/bookingIdempotency.model.js';
import env from '../config/env.js';
import runTransaction from '../utils/runTransaction.js';


const version = '20260814_008_booking_idempotency_records';
const description =
  'Move legacy appointment idempotency hashes into bounded TTL-backed records';


const buildPublicSnapshot = (appointment) => ({
  id: appointment._id,
  confirmationCode: appointment.confirmationCode,
  patientName: appointment.patientName,
  date: appointment.date,
  startTime: appointment.startTime,
  endTime: appointment.endTime,
  status: appointment.status,
  dentist: {
    id: appointment.dentist?._id || appointment.dentist,
    firstName:
      appointment.dentistSnapshot?.firstName || appointment.dentist?.firstName,
    lastName:
      appointment.dentistSnapshot?.lastName || appointment.dentist?.lastName,
    slug: appointment.dentist?.slug,
    title:
      appointment.dentistSnapshot?.title || appointment.dentist?.title || '',
    translations:
      appointment.dentistSnapshot?.translations ||
      appointment.dentist?.translations || {},
  },
  service: {
    id: appointment.service?._id || appointment.service,
    name: appointment.serviceSnapshot?.name || appointment.service?.name,
    translations:
      appointment.serviceSnapshot?.translations ||
      appointment.service?.translations || {},
    durationMinutes: appointment.serviceSnapshot?.durationMinutes,
    priceType: appointment.priceSnapshot?.priceType,
    priceFrom: appointment.priceSnapshot?.priceFrom,
    priceTo: appointment.priceSnapshot?.priceTo,
    currency: appointment.priceSnapshot?.currency,
  },
  price: appointment.priceSnapshot,
});


const run = async ({
  dryRun = true,
  now = new Date(),
  assertLease = async () => {},
  beforeAppointmentWrite,
}) => {
  const stats = {
    appointmentsScanned: 0,
    activeRecordsCreated: 0,
    expiredHashesCleared: 0,
    legacyHashesCleared: 0,
  };
  const cursor = Appointment.find({
    idempotencyKeyHash: { $type: 'string' },
    idempotencyRequestHash: { $type: 'string' },
  })
    .select('+idempotencyKeyHash +idempotencyRequestHash')
    .populate({
      path: 'dentist',
      select: 'firstName lastName slug title translations',
      transform: (document, id) => document || id,
    })
    .populate('service', 'name slug translations')
    .lean()
    .cursor();

  for await (const appointment of cursor) {
    stats.appointmentsScanned += 1;
    const createdAt = appointment.createdAt instanceof Date
      ? appointment.createdAt
      : null;
    const expiresAt = createdAt
      ? new Date(
          createdAt.getTime() +
          env.BOOKING_IDEMPOTENCY_TTL_HOURS * 60 * 60 * 1000
        )
      : now;
    const active = Boolean(createdAt && expiresAt > now);

    if (active) {
      stats.activeRecordsCreated += 1;
    }
    else {
      stats.expiredHashesCleared += 1;
    }
    if (dryRun) {
      continue;
    }

    await assertLease();
    await beforeAppointmentWrite?.(appointment);
    const cleared = await runTransaction(async (mongoSession) => {
      if (active) {
        await BookingIdempotency.collection.updateOne(
          { keyHash: appointment.idempotencyKeyHash },
          {
            $setOnInsert: {
              keyHash: appointment.idempotencyKeyHash,
              requestHash: appointment.idempotencyRequestHash,
              appointment: appointment._id,
              responseSnapshot: buildPublicSnapshot(appointment),
              expiresAt,
              createdAt: now,
            },
          },
          { upsert: true, session: mongoSession }
        );

        const persisted = await BookingIdempotency.collection.findOne(
          { keyHash: appointment.idempotencyKeyHash },
          {
            session: mongoSession,
            projection: { requestHash: 1, appointment: 1 },
          }
        );
        if (
          persisted?.requestHash !== appointment.idempotencyRequestHash ||
          String(persisted?.appointment) !== String(appointment._id)
        ) {
          throw new Error(
            'Booking idempotency migration found conflicting persisted ownership'
          );
        }
      }

      const result = await Appointment.collection.updateOne(
        {
          _id: appointment._id,
          idempotencyKeyHash: appointment.idempotencyKeyHash,
          idempotencyRequestHash: appointment.idempotencyRequestHash,
        },
        {
          $unset: {
            idempotencyKeyHash: '',
            idempotencyRequestHash: '',
          },
        },
        { session: mongoSession }
      );
      if (result.matchedCount !== 1) {
        throw new Error(
          'Appointment idempotency state changed during migration'
        );
      }
      return result.modifiedCount;
    });
    stats.legacyHashesCleared += cleared;
  }

  return stats;
};


export { version, description, run };
