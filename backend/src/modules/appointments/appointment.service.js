import crypto from 'crypto';

import Appointment from './appointment.model.js';

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
  data
) => {
  const patientPhone =
    normalizePhone(
      data.patientPhone
    );


  const clinic =
    await clinicService.getClinic();


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


  const existingCount =
    await Appointment.countDocuments({
      patientPhone,

      date:
        data.date,

      status: {
        $ne: 'cancelled',
      },
    });


  if (
    existingCount >=
    maxPerDay
  ) {
    throw new ApiError(
      429,
      `Maximum number of appointments per phone for this day is ${maxPerDay}`
    );
  }


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


    status:
      clinic.bookingSettings
        .autoConfirmAppointments
        ? 'confirmed'
        : 'pending',


    source:
      'website',


    patientComment:
      data.patientComment || '',


    privacyConsentAt:
      new Date(),
  };


  await Appointment.init();


  for (
    let attempt = 1;
    attempt <= 3;
    attempt += 1
  ) {
    try {
      const appointment =
        await Appointment.create({
          ...basePayload,

          confirmationCode:
            generateConfirmationCode(),
        });


      return Appointment
        .findById(
          appointment._id
        )
        .populate(
          'dentist',
          'firstName lastName slug title'
        )
        .populate(
          'service',
          'name slug'
        )
        .lean();
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


  throw new ApiError(
    500,
    'Could not generate appointment confirmation code'
  );
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
        'firstName lastName slug title'
      )
      .populate(
        'service',
        'name slug'
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
          'firstName lastName slug title'
        )
        .populate(
          'service',
          'name slug'
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


  appointment.status =
    status;


  if (
    internalNote !==
    undefined
  ) {
    appointment.internalNote =
      internalNote;
  }


  await appointment.save();


  return appointment;
};


const cancelAppointment = async (
  id,
  userId,
  reason
) => {
  const appointment =
    await Appointment
      .findById(id)
      .select('+lockKeys');


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


  appointment.status =
    'cancelled';

  appointment.cancelledAt =
    new Date();

  appointment.cancelledBy =
    userId;

  appointment.cancellationReason =
    reason;


  appointment.lockKeys = [
    `released:${appointment._id}`,
  ];


  await appointment.save();


  return appointment;
};



const createAdminAppointment = async (
  data,
  userId
) => {
  const appointment =
    await createAppointment({
      ...data,
    });


  await Appointment.updateOne(
    {
      _id: appointment._id,
    },

    {
      $set: {
        source:
          data.source ||
          'phone',

        createdBy:
          userId,

        internalNote:
          data.internalNote ||
          '',

        privacyConsentMethod:
          data.consentMethod,
      },
    }
  );


  return getAppointmentById(
    appointment._id
  );
};


const rescheduleAppointment = async (
  id,
  data
) => {
  const appointment =
    await Appointment
      .findById(id)
      .select('+lockKeys');


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


  appointment.dentist =
    availability.dentist.id;

  appointment.service =
    availability.service.id;


  appointment.dentistSnapshot = {
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
  };


  appointment.serviceSnapshot = {
    name:
      availability
        .service
        .name,

    durationMinutes:
      availability
        .service
        .durationMinutes,
  };


  appointment.priceSnapshot = {
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
  };


  appointment.date =
    data.date;

  appointment.startTime =
    selectedSlot.start;

  appointment.endTime =
    selectedSlot.end;

  appointment.startAt =
    new Date(
      selectedSlot.startAt
    );

  appointment.endAt =
    new Date(
      selectedSlot.endAt
    );

  appointment.bufferMinutes =
    availability.rules
      .bufferMinutes;


  appointment.lockKeys =
    buildLockKeys(
      data.date,
      startMinute,
      endMinute
    );


  try {
    await appointment.save();
  }
  catch (error) {
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


