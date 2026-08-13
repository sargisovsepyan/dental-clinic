import crypto from 'crypto';

import mongoose from 'mongoose';

import Appointment from './appointment.model.js';
import {
  acquirePhoneDailyQuota,
  releasePhoneDailyQuota,
} from './phoneDailyQuota.service.js';

import * as availabilityService from '../availability/availability.service.js';
import * as clinicService from '../clinic/clinic.service.js';

import ApiError from '../../utils/ApiError.js';
import normalizePhone from '../../utils/normalizePhone.js';


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


const createAppointment = async (
  data,
  context = {}
) => {
  const patientPhone =
    normalizePhone(
      data.patientPhone
    );


  const clinic =
    await clinicService.getClinic();


  if (
    clinic.bookingSettings
      .requireEmail &&
    !data.patientEmail
  ) {
    throw new ApiError(
      400,
      'Email is required for booking'
    );
  }


  const availability =
    await availabilityService
      .getAvailability({
        dentistId:
          data.dentistId,

        serviceId:
          data.serviceId,

        date:
          data.date,
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
      'Selected time is no longer available'
    );
  }


  const maxPerDay =
    clinic.bookingSettings
      .maxAppointmentsPerPhonePerDay;


  const appointmentId =
    new mongoose.Types.ObjectId();

  const quotaReservationId =
    appointmentId;


  const startMinute =
    timeToMinutes(
      selectedSlot.start
    );


  const appointmentEndMinute =
    timeToMinutes(
      selectedSlot.end
    );


  const blockedEndMinute =
    appointmentEndMinute +
    availability.rules
      .bufferMinutes;


  const lockKeys =
    buildLockKeys(
      data.date,
      startMinute,
      blockedEndMinute
    );


  const basePayload = {
    patientName:
      data.patientName,

    patientPhone,

    patientEmail:
      data.patientEmail || '',


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
      availability
        .rules
        .bufferMinutes,


    lockKeys,

    quotaReservationId,


    status:
      clinic.bookingSettings
        .autoConfirmAppointments
        ? 'confirmed'
        : 'pending',


    source:
      context.source ||
      'website',


    patientComment:
      data.patientComment || '',


    internalNote:
      context.internalNote || '',


    privacyConsentAt:
      new Date(),

    privacyConsentMethod:
      context.privacyConsentMethod ||
      'website',

    createdBy:
      context.createdBy || null,
  };


  await Appointment.init();

  await acquirePhoneDailyQuota({
    patientPhone,
    date: data.date,
    reservationId: quotaReservationId,
    limit: maxPerDay,
  });

  let appointment;

  try {
    for (
      let attempt = 1;
      attempt <= 3;
      attempt += 1
    ) {
      try {
        appointment =
          await Appointment.create({
            _id: appointmentId,
            ...basePayload,

            confirmationCode:
              generateConfirmationCode(),
          });

        break;
      }
      catch (error) {
        const isDuplicateKey =
          error?.code === 11000 ||
          String(error?.message || '')
            .includes('E11000');

        if (!isDuplicateKey) {
          throw error;
        }

        const duplicateField =
          Object.keys(
            error?.keyPattern || {}
          )[0];

        if (
          duplicateField ===
          'confirmationCode'
        ) {
          continue;
        }

        throw new ApiError(
          409,
          'Selected time was just booked by another patient. Please choose another time.'
        );
      }
    }

    if (!appointment) {
      throw new ApiError(
        500,
        'Could not generate appointment confirmation code'
      );
    }
  }
  catch (error) {
    await releasePhoneDailyQuota({
      patientPhone,
      date: data.date,
      reservationId: quotaReservationId,
    }).catch(() => {});

    throw error;
  }

  return Appointment
    .findById(appointment._id)
    .populate(
      'dentist',
      'firstName lastName slug title translations'
    )
    .populate(
      'service',
      'name slug translations'
    )
    .lean();
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


  const updated =
    await Appointment
      .findOneAndUpdate(
        {
          _id: id,
          status:
            appointment.status,
          updatedAt:
            appointment.updatedAt,
        },
        {
          $set: update,
        },
        {
          returnDocument:
            'after',
          runValidators: true,
        }
      );


  if (!updated) {
    throw new ApiError(
      409,
      'Appointment status changed; reload and try again'
    );
  }


  return updated;
};


const cancelAppointment = async (
  id,
  userId,
  reason
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


  if (
    appointment.status ===
    'cancelled'
  ) {
    throw new ApiError(
      409,
      'Appointment is already cancelled'
    );
  }


  if (
    appointment.status ===
      'completed' ||
    appointment.status ===
      'no_show'
  ) {
    throw new ApiError(
      409,
      `Cannot cancel a ${appointment.status} appointment`
    );
  }


  const cancelled =
    await Appointment
      .findOneAndUpdate(
        {
          _id: appointment._id,
          status:
            appointment.status,
          updatedAt:
            appointment.updatedAt,
        },
        {
          $set: {
            status: 'cancelled',
            cancelledAt:
              new Date(),
            cancelledBy:
              userId,
            cancellationReason:
              reason,
            lockKeys: [
              `released:${appointment._id}`,
            ],
          },
        },
        {
          returnDocument:
            'after',
          runValidators: true,
        }
      );


  if (!cancelled) {
    throw new ApiError(
      409,
      'Appointment changed; reload and try again'
    );
  }

  await releasePhoneDailyQuota({
    patientPhone:
      appointment.patientPhone,
    date: appointment.date,
    reservationId:
      appointment.quotaReservationId ||
      appointment._id,
  }).catch((error) => {
    console.error(
      'APPOINTMENT_QUOTA_RELEASE_FAILED',
      {
        appointmentId:
          String(appointment._id),
        message: error.message,
      }
    );
  });


  return cancelled;
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
  data
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


  if (
    [
      'cancelled',
      'completed',
      'no_show',
    ].includes(
      appointment.status
    )
  ) {
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

  let acquiredTargetQuota = false;

  if (
    changesQuotaDate ||
    !appointment.quotaReservationId
  ) {
    const clinic =
      await clinicService.getClinic();

    await acquirePhoneDailyQuota({
      patientPhone:
        appointment.patientPhone,
      date: data.date,
      reservationId:
        targetReservationId,
      limit:
        clinic.bookingSettings
          .maxAppointmentsPerPhonePerDay,
    });

    acquiredTargetQuota =
      changesQuotaDate;
  }


  try {
    const updated =
      await Appointment
        .findOneAndUpdate(
          {
            _id:
              appointment._id,
            status:
              appointment.status,
            updatedAt:
              appointment.updatedAt,
          },
          {
            $set: update,
          },
          {
            returnDocument:
              'after',
            runValidators: true,
          }
        );

    if (!updated) {
      throw new ApiError(
        409,
        'Appointment changed; reload and try again'
      );
    }
  }
  catch (error) {
    if (acquiredTargetQuota) {
      await releasePhoneDailyQuota({
        patientPhone:
          appointment.patientPhone,
        date: data.date,
        reservationId:
          targetReservationId,
      }).catch(() => {});
    }

    const duplicate =
      error?.code === 11000 ||
      String(
        error?.message || ''
      ).includes(
        'E11000'
      );


    if (duplicate) {
      throw new ApiError(
        409,
        'Selected time was just booked by another patient'
      );
    }

    throw error;
  }

  if (changesQuotaDate) {
    await releasePhoneDailyQuota({
      patientPhone:
        appointment.patientPhone,
      date: appointment.date,
      reservationId:
        currentReservationId,
    }).catch((error) => {
      console.error(
        'APPOINTMENT_OLD_QUOTA_RELEASE_FAILED',
        {
          appointmentId:
            String(appointment._id),
          message: error.message,
        }
      );
    });
  }


  return getAppointmentById(
    appointment._id
  );
};


export {
  createAppointment,
  createAdminAppointment,
  rescheduleAppointment,
  getAppointments,
  getAppointmentById,
  updateStatus,
  cancelAppointment,
};


