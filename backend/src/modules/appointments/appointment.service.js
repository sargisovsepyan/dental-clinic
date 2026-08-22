import crypto from 'crypto';

import mongoose from 'mongoose';

import Appointment from './appointment.model.js';
import BookingIdempotency from './bookingIdempotency.model.js';
import NotificationJob from '../notifications/notificationJob.model.js';
import {
  scheduleCreatedNotifications,
  reconcileStatusNotifications,
  reconcileRescheduleNotifications,
  reconcileCancellationNotifications,
} from '../notifications/notificationOutbox.service.js';
import {
  initializePhoneQuotaInfrastructure,
  assertPhoneQuotaKeyIdentity,
  acquirePhoneDailyQuota,
  releasePhoneDailyQuota,
} from './phoneDailyQuota.service.js';

import * as availabilityService from '../availability/availability.service.js';
import Clinic from '../clinic/clinic.model.js';
import Dentist from '../dentists/dentist.model.js';
import Service from '../services/service.model.js';
import ServiceCategory from '../serviceCategories/serviceCategory.model.js';

import ApiError from '../../utils/ApiError.js';
import normalizePhone from '../../utils/normalizePhone.js';
import runTransaction from '../../utils/runTransaction.js';
import env from '../../config/env.js';


class BookingGuardChangedError extends Error {
  constructor() {
    super('Booking inputs changed during appointment admission');
    this.name = 'BookingGuardChangedError';
  }
}


const versionPredicate = (field, value) => (
  Number.isInteger(value) && value > 0
    ? { [field]: value }
    : {
        $or: [
          { [field]: 0 },
          { [field]: { $exists: false } },
        ],
      }
);


const bookingGuardPredicate = (value) =>
  versionPredicate('bookingGuardVersion', value);


const touchBookingGuards = async (guard, session) => {
  const category = await ServiceCategory.updateOne(
    {
      _id: guard.categoryId,
      ...versionPredicate('serviceMutationVersion', guard.categoryVersion),
      isActive: true,
    },
    { $inc: { serviceMutationVersion: 1 } },
    { session }
  );
  if (category.modifiedCount !== 1) {
    throw new BookingGuardChangedError();
  }

  const service = await Service.updateOne(
    {
      _id: guard.serviceId,
      category: guard.categoryId,
      ...bookingGuardPredicate(guard.serviceVersion),
      isActive: true,
      bookingEnabled: true,
    },
    { $inc: { bookingGuardVersion: 1 } },
    { session }
  );
  if (service.modifiedCount !== 1) {
    throw new BookingGuardChangedError();
  }

  const clinic = await Clinic.updateOne(
    {
      _id: guard.clinicId,
      ...bookingGuardPredicate(guard.clinicVersion),
    },
    { $inc: { bookingGuardVersion: 1 } },
    { session }
  );
  if (clinic.modifiedCount !== 1) {
    throw new BookingGuardChangedError();
  }

  const dentist = await Dentist.updateOne(
    {
      _id: guard.dentistId,
      ...bookingGuardPredicate(guard.dentistVersion),
      isActive: true,
      bookingEnabled: true,
    },
    { $inc: { bookingGuardVersion: 1 } },
    { session }
  );
  if (dentist.modifiedCount !== 1) {
    throw new BookingGuardChangedError();
  }
};


const generateConfirmationCode = () => {
  return (
    'DC-' +
    crypto
      .randomBytes(8)
      .toString('hex')
      .toUpperCase()
  );
};


const timeToMinutes = (time) => {
  const [hours, minutes] =
    time.split(':').map(Number);

  return hours * 60 + minutes;
};


const buildLockKeys = (
  date,
  startMinute,
  endMinute
) => {
  const keys = [];

  for (
    let minute = startMinute;
    minute < endMinute;
    minute += 1
  ) {
    keys.push(
      `${date}:${minute}`
    );
  }

  return keys;
};


const hashIdempotencyKey = (key) => (
  crypto
    .createHash('sha256')
    .update('booking-idempotency\0', 'utf8')
    .update(key, 'utf8')
    .digest('hex')
);


const IDEMPOTENCY_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


const validateBookingIdempotencyKey = (key, { required = false } = {}) => {
  if (!key && !required) {
    return null;
  }
  if (typeof key !== 'string' || !IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new ApiError(400, 'Idempotency-Key must be a UUID v4');
  }
  return key.toLowerCase();
};


const hashBookingRequest = (
  data,
  patientPhone,
  idempotencyKey,
  version = 'v2'
) => {
  if (!['v1', 'v2'].includes(version)) {
    throw new Error('Unsupported booking request hash version');
  }
  const fingerprint = {
    patientName: data.patientName,
    patientPhone,
    patientEmail: (data.patientEmail || '').toLowerCase(),
    dentistId: String(data.dentistId),
    serviceId: String(data.serviceId),
    date: data.date,
    startTime: data.startTime,
    patientComment: data.patientComment || '',
    privacyAccepted: data.privacyAccepted,
  };
  if (version === 'v2') {
    fingerprint.locale = data.locale || 'hy';
  }
  return crypto
    .createHmac('sha256', idempotencyKey)
    .update(
      version === 'v1'
        ? 'booking-request-fingerprint\0'
        : 'booking-request-fingerprint-v2\0',
      'utf8'
    )
    .update(JSON.stringify(fingerprint), 'utf8')
    .digest('hex');
};


const BOOKING_METADATA = Symbol('bookingMetadata');


const attachBookingMetadata = (
  appointment,
  { replayed, publicResult }
) => {
  Object.defineProperty(appointment, BOOKING_METADATA, {
    value: Object.freeze({ replayed, publicResult }),
    enumerable: false,
  });
  return appointment;
};


const wasIdempotentBookingReplay = (appointment) => Boolean(
  appointment?.[BOOKING_METADATA]?.replayed
);


const getPublicBookingResult = (appointment) => (
  appointment?.[BOOKING_METADATA]?.publicResult || {
    id: appointment._id,
    confirmationCode: appointment.confirmationCode,
    patientName: appointment.patientName,
    date: appointment.date,
    startTime: appointment.startTime,
    endTime: appointment.endTime,
    status: appointment.status,
    dentist: appointment.dentist,
    service: appointment.service,
    price: appointment.priceSnapshot,
  }
);


const getAppointmentResult = (id) => Appointment
  .findById(id)
  .populate(
    'dentist',
    'firstName lastName slug title translations'
  )
  .populate(
    'service',
    'name slug translations'
  )
  .lean();


const resolveIdempotentAppointment = async (
  idempotencyKeyHash,
  idempotencyRequestHashes
) => {
  if (!idempotencyKeyHash) {
    return null;
  }

  const now = new Date();
  const record = await BookingIdempotency.findOne({
    keyHash: idempotencyKeyHash,
  })
    .select('+keyHash +requestHash +requestHashVersion +responseSnapshot')
    .lean();
  if (record?.expiresAt <= now) {
    await BookingIdempotency.deleteOne({
      _id: record._id,
      expiresAt: { $lte: now },
    });
  }
  else if (record) {
    const requestHashVersion = record.requestHashVersion || 'v1';
    if (record.requestHash !== idempotencyRequestHashes[requestHashVersion]) {
      throw new ApiError(
        409,
        'Idempotency key was already used with a different booking request'
      );
    }
    const appointment = await getAppointmentResult(record.appointment);
    if (!appointment) {
      throw new ApiError(
        409,
        'The original idempotent booking result is no longer available'
      );
    }
    return attachBookingMetadata(appointment, {
      replayed: true,
      publicResult: record.responseSnapshot,
    });
  }

  const existing = await Appointment.findOne({ idempotencyKeyHash })
    .select('+idempotencyKeyHash +idempotencyRequestHash')
    .lean();
  if (!existing) {
    return null;
  }
  if (existing.idempotencyRequestHash !== idempotencyRequestHashes.v1) {
    throw new ApiError(
      409,
      'Idempotency key was already used with a different booking request'
    );
  }

  const appointment = await getAppointmentResult(existing._id);
  return attachBookingMetadata(appointment, {
    replayed: true,
    publicResult: getPublicBookingResult(appointment),
  });
};


const mutationVersionPredicate = (value) => {
  const version = Number.isInteger(value) ? value : 0;
  return version === 0
    ? {
        $or: [
          { mutationVersion: 0 },
          { mutationVersion: { $exists: false } },
        ],
      }
    : { mutationVersion: version };
};


const isDuplicateKeyError = (error) => (
  error?.code === 11000 || String(error?.message || '').includes('E11000')
);


const duplicateTargetsFieldOrIndex = (error, field, indexName) => (
  Object.hasOwn(error?.keyPattern || {}, field) ||
  String(error?.message || '').includes(indexName)
);


const initializeNotificationInfrastructure = async () => {
  if (env.NOTIFICATIONS_ENABLED && env.NODE_ENV !== 'production') {
    await NotificationJob.init();
  }
};


const prepareAppointment = async ({
  data,
  context,
  patientPhone,
  appointmentId,
}) => {
  const availability = await availabilityService.getAvailability({
    dentistId: data.dentistId,
    serviceId: data.serviceId,
    date: data.date,
    includeBookingGuard: true,
  });
  const selectedSlot = availability.slots.find(
    (slot) => slot.start === data.startTime
  );
  if (!selectedSlot) {
    throw new ApiError(409, 'Selected time is no longer available');
  }
  const settings = availability._bookingSettings;
  if (settings.requireEmail && !data.patientEmail) {
    throw new ApiError(400, 'Email is required for booking');
  }

  const startMinute = timeToMinutes(selectedSlot.start);
  const endMinute = timeToMinutes(selectedSlot.end);
  const priceSnapshot = {
    priceType: availability.service.priceType,
    priceFrom: availability.service.priceFrom,
    priceTo: availability.service.priceTo,
    currency: availability.service.currency,
  };
  const payload = {
    patientName: data.patientName,
    patientPhone,
    patientEmail: data.patientEmail || '',
    dentist: availability.dentist.id,
    service: availability.service.id,
    dentistSnapshot: {
      firstName: availability.dentist.firstName,
      lastName: availability.dentist.lastName,
      title: availability.dentist.title || '',
      translations: availability.dentist.translations || {},
    },
    serviceSnapshot: {
      name: availability.service.name,
      durationMinutes: availability.service.durationMinutes,
      translations: availability.service.translations || {},
    },
    priceSnapshot,
    date: data.date,
    startTime: selectedSlot.start,
    endTime: selectedSlot.end,
    startAt: new Date(selectedSlot.startAt),
    endAt: new Date(selectedSlot.endAt),
    bufferMinutes: availability.rules.bufferMinutes,
    lockKeys: buildLockKeys(
      data.date,
      startMinute,
      endMinute + availability.rules.bufferMinutes
    ),
    quotaReservationId: appointmentId,
    scheduleRevision: 0,
    notificationLocale: data.locale || 'hy',
    status: settings.autoConfirmAppointments ? 'confirmed' : 'pending',
    source: context.source || 'website',
    patientComment: data.patientComment || '',
    internalNote: context.internalNote || '',
    privacyConsentAt: new Date(),
    privacyConsentMethod: context.privacyConsentMethod || 'website',
    privacyPolicyVersion: env.APPOINTMENT_PRIVACY_POLICY_VERSION,
    createdBy: context.createdBy || null,
  };
  return { availability, settings, payload };
};


const createAppointment = async (data, context = {}) => {
  const patientPhone = normalizePhone(data.patientPhone);
  const idempotencyKey = validateBookingIdempotencyKey(context.idempotencyKey);
  const idempotencyKeyHash = idempotencyKey
    ? hashIdempotencyKey(idempotencyKey)
    : null;
  const idempotencyRequestHashes = idempotencyKey
    ? {
        v1: hashBookingRequest(data, patientPhone, idempotencyKey, 'v1'),
        v2: hashBookingRequest(data, patientPhone, idempotencyKey, 'v2'),
      }
    : { v1: null, v2: null };
  const idempotent = await resolveIdempotentAppointment(
    idempotencyKeyHash,
    idempotencyRequestHashes
  );
  if (idempotent) {
    return idempotent;
  }

  await Promise.all([
    Appointment.init(),
    BookingIdempotency.init(),
    ...(env.NOTIFICATIONS_ENABLED && env.NODE_ENV !== 'production'
      ? [NotificationJob.init()]
      : []),
    initializePhoneQuotaInfrastructure(),
  ]);
  await assertPhoneQuotaKeyIdentity();

  const appointmentId = new mongoose.Types.ObjectId();
  let bookingOutcome;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    const replayBeforeAdmission = await resolveIdempotentAppointment(
      idempotencyKeyHash,
      idempotencyRequestHashes
    );
    if (replayBeforeAdmission) {
      return replayBeforeAdmission;
    }
    let prepared;
    try {
      prepared = await prepareAppointment({
        data,
        context,
        patientPhone,
        appointmentId,
      });
    }
    catch (error) {
      const replayAfterPreparation = await resolveIdempotentAppointment(
        idempotencyKeyHash,
        idempotencyRequestHashes
      );
      if (replayAfterPreparation) {
        return replayAfterPreparation;
      }
      throw error;
    }
    try {
      bookingOutcome = await runTransaction(async (session) => {
        await touchBookingGuards(prepared.availability._bookingGuard, session);
        await acquirePhoneDailyQuota({
          patientPhone,
          date: data.date,
          reservationId: appointmentId,
          limit: prepared.settings.maxAppointmentsPerPhonePerDay,
          session,
        });

        const confirmationCode = generateConfirmationCode();
        const [created] = await Appointment.create([{
          _id: appointmentId,
          ...prepared.payload,
          confirmationCode,
        }], { session });
        const notificationNow = new Date();
        await scheduleCreatedNotifications(created, {
          session,
          now: notificationNow,
        });
        const publicResult = {
          id: appointmentId,
          confirmationCode,
          patientName: prepared.payload.patientName,
          date: prepared.payload.date,
          startTime: prepared.payload.startTime,
          endTime: prepared.payload.endTime,
          status: prepared.payload.status,
          dentist: prepared.availability.dentist,
          service: prepared.availability.service,
          price: prepared.payload.priceSnapshot,
        };
        if (idempotencyKeyHash) {
          await BookingIdempotency.create([{
            keyHash: idempotencyKeyHash,
            requestHash: idempotencyRequestHashes.v2,
            requestHashVersion: 'v2',
            appointment: appointmentId,
            responseSnapshot: publicResult,
            expiresAt: new Date(
              Date.now() +
              env.BOOKING_IDEMPOTENCY_TTL_HOURS * 60 * 60 * 1000
            ),
          }], { session });
        }
        return { appointment: created, publicResult };
      });
      break;
    }
    catch (error) {
      if (error instanceof BookingGuardChangedError) {
        continue;
      }
      const duplicate = isDuplicateKeyError(error);
      if (!duplicate) {
        throw error;
      }
      const replay = await resolveIdempotentAppointment(
        idempotencyKeyHash,
        idempotencyRequestHashes
      );
      if (replay) {
        return replay;
      }
      if (Object.keys(error?.keyPattern || {})[0] === 'confirmationCode') {
        continue;
      }
      if (!duplicateTargetsFieldOrIndex(
        error,
        'lockKeys',
        'unique_dentist_booking_lock'
      )) {
        throw error;
      }
      throw new ApiError(
        409,
        'Selected time was just booked by another patient. Please choose another time.'
      );
    }
  }

  if (!bookingOutcome) {
    throw new ApiError(
      409,
      'Booking settings changed repeatedly; reload availability and try again',
      { code: 'BOOKING_SCHEDULE_CHANGED' }
    );
  }
  const appointment = await getAppointmentResult(bookingOutcome.appointment._id);
  return attachBookingMetadata(appointment, {
    replayed: false,
    publicResult: bookingOutcome.publicResult,
  });
};


const getAppointments = async (
  query
) => {
  const filter = {};


  if (query.date) {
    filter.date =
      query.date;
  }


  if (
    query.from ||
    query.to
  ) {
    filter.date = {};

    if (query.from) {
      filter.date.$gte =
        query.from;
    }

    if (query.to) {
      filter.date.$lte =
        query.to;
    }
  }


  if (query.dentistId) {
    filter.dentist =
      query.dentistId;
  }


  if (query.serviceId) {
    filter.service =
      query.serviceId;
  }


  if (query.status) {
    filter.status =
      query.status;
  }


  if (query.phone) {
    filter.patientPhone =
      normalizePhone(
        query.phone
      );
  }


  const page =
    query.page || 1;

  const limit =
    query.limit || 25;

  const skip =
    (page - 1) * limit;


  const [
    appointments,
    total,
  ] = await Promise.all([
    Appointment.find(filter)
      .populate(
        'dentist',
        'firstName lastName slug title translations'
      )
      .populate(
        'service',
        'name slug translations'
      )
      .sort({
        startAt: 1,
      })
      .skip(skip)
      .limit(limit)
      .lean(),

    Appointment.countDocuments(
      filter
    ),
  ]);


  return {
    appointments,

    pagination: {
      page,
      limit,
      total,

      pages:
        Math.ceil(
          total / limit
        ),
    },
  };
};


const getAppointmentById =
  async (id) => {
    const appointment =
      await Appointment
        .findById(id)
        .populate(
          'dentist',
          'firstName lastName slug title translations'
        )
        .populate(
          'service',
          'name slug translations'
        )
        .lean();


    if (!appointment) {
      throw new ApiError(
        404,
        'Appointment not found'
      );
    }


    return appointment;
  };


const allowedTransitions = {
  pending: [
    'confirmed',
    'no_show',
  ],

  confirmed: [
    'checked_in',
    'no_show',
  ],

  checked_in: [
    'in_progress',
  ],

  in_progress: [
    'completed',
  ],

  completed: [],

  cancelled: [],

  no_show: [],
};


const updateStatus = async (
  id,
  status,
  internalNote
) => {
  const appointment =
    await Appointment.findById(
      id
    );


  if (!appointment) {
    throw new ApiError(
      404,
      'Appointment not found'
    );
  }


  const allowed =
    allowedTransitions[
      appointment.status
    ] || [];


  if (
    !allowed.includes(
      status
    )
  ) {
    throw new ApiError(
      409,
      `Cannot change appointment from ${appointment.status} to ${status}`
    );
  }


  const update = {
    status,
  };


  if (
    internalNote !==
    undefined
  ) {
    update.internalNote =
      internalNote;
  }


  await initializeNotificationInfrastructure();
  return runTransaction(async (session) => {
    const updated =
      await Appointment.findOneAndUpdate(
        {
          _id: id,
          status:
            appointment.status,
          ...mutationVersionPredicate(
            appointment.mutationVersion
          ),
        },
        {
          $set: update,
          $inc: { mutationVersion: 1 },
        },
        {
          returnDocument:
            'after',
          runValidators: true,
          session,
        }
      );


  if (!updated) {
    throw new ApiError(
      409,
      'Appointment status changed; reload and try again'
    );
  }

    await reconcileStatusNotifications({
      before: appointment,
      after: updated,
      session,
      now: new Date(),
    });
    return updated;
  });
};


const cancelAppointment = async (
  id,
  userId,
  reason
) => {
  await initializePhoneQuotaInfrastructure();
  await initializeNotificationInfrastructure();

  const appointment = await Appointment.findById(id)
    .select('+lockKeys +quotaReservationId');

  if (!appointment) {
    throw new ApiError(404, 'Appointment not found');
  }
  if (appointment.status === 'cancelled') {
    throw new ApiError(409, 'Appointment is already cancelled');
  }
  if (['completed', 'no_show'].includes(appointment.status)) {
    throw new ApiError(
      409,
      `Cannot cancel a ${appointment.status} appointment`
    );
  }

  return runTransaction(async (session) => {
    const cancelled = await Appointment.findOneAndUpdate(
      {
        _id: appointment._id,
        status: appointment.status,
        ...mutationVersionPredicate(appointment.mutationVersion),
      },
      {
        $set: {
          status: 'cancelled',
          cancelledAt: new Date(),
          cancelledBy: userId,
          cancellationReason: reason,
          lockKeys: [`released:${appointment._id}`],
        },
        $inc: { mutationVersion: 1 },
      },
      {
        returnDocument: 'after',
        runValidators: true,
        session,
      }
    );

    if (!cancelled) {
      throw new ApiError(409, 'Appointment changed; reload and try again');
    }

    await reconcileCancellationNotifications({
      before: appointment,
      after: cancelled,
      session,
      now: new Date(),
    });

    await releasePhoneDailyQuota({
      patientPhone: appointment.patientPhone,
      date: appointment.date,
      reservationId: appointment.quotaReservationId || appointment._id,
      session,
    });

    return cancelled;
  });
};



const createAdminAppointment = async (
  data,
  userId
) => {
  return createAppointment(
    {
      ...data,
    },
    {
      source:
        data.source ||
        'phone',
      createdBy:
        userId,
      internalNote:
        data.internalNote || '',
      privacyConsentMethod:
        data.consentMethod,
    }
  );
};


const rescheduleAppointment = async (
  id,
  data,
  actorId = null,
  bookingGuardRetry = 0,
  expectedMutationVersion = null
) => {
  const appointment =
    await Appointment
      .findById(id)
      .select(
        '+lockKeys +quotaReservationId'
      );


  if (!appointment) {
    throw new ApiError(
      404,
      'Appointment not found'
    );
  }

  const observedMutationVersion = Number.isInteger(
    appointment.mutationVersion
  )
    ? appointment.mutationVersion
    : 0;

  if (
    expectedMutationVersion !== null &&
    observedMutationVersion !== expectedMutationVersion
  ) {
    throw new ApiError(
      409,
      'Appointment changed; reload and try again'
    );
  }

  const retryMutationVersion = expectedMutationVersion ??
    observedMutationVersion;


  if (!['pending', 'confirmed'].includes(appointment.status)) {
    throw new ApiError(
      409,
      `Cannot reschedule a ${appointment.status} appointment`
    );
  }


  const dentistId =
    data.dentistId ||
    appointment.dentist;


  const serviceId =
    data.serviceId ||
    appointment.service;


  const availability =
    await availabilityService
      .getAvailability({
        dentistId,
        serviceId,
        date:
          data.date,

        excludeAppointmentId:
          appointment._id,

        includeBookingGuard: true,
      });


  const selectedSlot =
    availability.slots.find(
      (slot) =>
        slot.start ===
        data.startTime
    );


  if (!selectedSlot) {
    throw new ApiError(
      409,
      'Selected time is not available'
    );
  }

  const materialScheduleChange =
    String(availability.dentist.id) !== String(appointment.dentist) ||
    String(availability.service.id) !== String(appointment.service) ||
    new Date(selectedSlot.startAt).getTime() !==
      new Date(appointment.startAt).getTime() ||
    new Date(selectedSlot.endAt).getTime() !==
      new Date(appointment.endAt).getTime();
  if (!materialScheduleChange) {
    const unchanged = await Appointment.findOne({
      _id: appointment._id,
      status: appointment.status,
      ...mutationVersionPredicate(appointment.mutationVersion),
    })
      .populate(
        'dentist',
        'firstName lastName slug title translations'
      )
      .populate(
        'service',
        'name slug translations'
      )
      .lean();
    if (!unchanged) {
      throw new ApiError(
        409,
        'Appointment changed; reload and try again'
      );
    }
    return unchanged;
  }


  const startMinute =
    timeToMinutes(
      selectedSlot.start
    );


  const endMinute =
    timeToMinutes(
      selectedSlot.end
    ) +
    availability.rules
      .bufferMinutes;

  const changesQuotaDate =
    data.date !== appointment.date;

  const currentReservationId =
    appointment.quotaReservationId ||
    appointment._id;

  const targetReservationId =
    changesQuotaDate
      ? new mongoose.Types.ObjectId()
      : currentReservationId;


  const update = {
    dentist:
      availability.dentist.id,

    service:
      availability.service.id,

    dentistSnapshot: {
      firstName:
        availability
          .dentist
          .firstName,

      lastName:
        availability
          .dentist
          .lastName,

      title:
        availability
          .dentist
          .title || '',

      translations:
        availability
          .dentist
          .translations || {},
    },


    serviceSnapshot: {
      name:
        availability
          .service
          .name,

      durationMinutes:
        availability
          .service
          .durationMinutes,

      translations:
        availability
          .service
          .translations || {},
    },


    priceSnapshot: {
      priceType:
        availability
          .service
          .priceType,

      priceFrom:
        availability
          .service
          .priceFrom,

      priceTo:
        availability
          .service
          .priceTo,

      currency:
        availability
          .service
          .currency,
    },


    date:
      data.date,

    startTime:
      selectedSlot.start,

    endTime:
      selectedSlot.end,

    startAt:
      new Date(
        selectedSlot.startAt
      ),

    endAt:
      new Date(
        selectedSlot.endAt
      ),

    bufferMinutes:
      availability.rules
        .bufferMinutes,

    lockKeys:
      buildLockKeys(
        data.date,
        startMinute,
        endMinute
      ),

    quotaReservationId:
      targetReservationId,
  };

  const historyEntry = {
    actor: actorId,
    reason: data.reason || '',
    changedAt: new Date(),
    from: {
      dentist: appointment.dentist,
      service: appointment.service,
      date: appointment.date,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
    },
    to: {
      dentist: availability.dentist.id,
      service: availability.service.id,
      date: data.date,
      startTime: selectedSlot.start,
      endTime: selectedSlot.end,
    },
  };

  await initializePhoneQuotaInfrastructure();
  await initializeNotificationInfrastructure();
  await assertPhoneQuotaKeyIdentity();
  try {
    await runTransaction(async (session) => {
      await touchBookingGuards(availability._bookingGuard, session);
      if (changesQuotaDate || !appointment.quotaReservationId) {
        await acquirePhoneDailyQuota({
          patientPhone: appointment.patientPhone,
          date: data.date,
          reservationId: targetReservationId,
          limit:
            availability._bookingSettings
              .maxAppointmentsPerPhonePerDay,
          session,
        });
      }

      const updated = await Appointment.findOneAndUpdate(
          {
            _id: appointment._id,
            status: appointment.status,
            ...mutationVersionPredicate(appointment.mutationVersion),
          },
          {
            $set: update,
            $inc: {
              mutationVersion: 1,
              scheduleRevision: 1,
            },
            $push: {
              rescheduleHistory: {
                $each: [historyEntry],
                $slice: -100,
              },
            },
          },
          {
            returnDocument: 'after',
            runValidators: true,
            session,
          }
        );

      if (!updated) {
        throw new ApiError(
          409,
          'Appointment changed; reload and try again'
        );
      }

      await reconcileRescheduleNotifications({
        before: appointment,
        after: updated,
        session,
        now: new Date(),
      });

      if (changesQuotaDate) {
        await releasePhoneDailyQuota({
          patientPhone: appointment.patientPhone,
          date: appointment.date,
          reservationId: currentReservationId,
          session,
        });
      }
    });
  }
  catch (error) {
    if (error instanceof BookingGuardChangedError) {
      if (bookingGuardRetry < 5) {
        return rescheduleAppointment(
          id,
          data,
          actorId,
          bookingGuardRetry + 1,
          retryMutationVersion
        );
      }
      throw new ApiError(
        409,
        'Booking schedule changed; reload availability and try again',
        { code: 'BOOKING_SCHEDULE_CHANGED' }
      );
    }
    const duplicate = isDuplicateKeyError(error);


    if (
      duplicate &&
      duplicateTargetsFieldOrIndex(
        error,
        'lockKeys',
        'unique_dentist_booking_lock'
      )
    ) {
      throw new ApiError(
        409,
        'Selected time was just booked by another patient'
      );
    }

    throw error;
  }

  return getAppointmentById(
    appointment._id
  );
};


export {
  hashBookingRequest,
  validateBookingIdempotencyKey,
  wasIdempotentBookingReplay,
  getPublicBookingResult,
  createAppointment,
  createAdminAppointment,
  rescheduleAppointment,
  getAppointments,
  getAppointmentById,
  updateStatus,
  cancelAppointment,
};


