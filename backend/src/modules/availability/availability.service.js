import { DateTime } from 'luxon';

import Dentist from '../dentists/dentist.model.js';
import DentistScheduleException from '../dentists/dentistScheduleException.model.js';

import Service from '../services/service.model.js';

import Appointment from '../appointments/appointment.model.js';

import * as clinicService from '../clinic/clinic.service.js';

import ApiError from '../../utils/ApiError.js';


const timeToMinutes = (time) => {
  const [hours, minutes] =
    time.split(':').map(Number);

  return hours * 60 + minutes;
};


const minutesToTime = (minutes) => {
  const hours =
    Math.floor(minutes / 60);

  const mins =
    minutes % 60;

  return `${String(hours).padStart(
    2,
    '0'
  )}:${String(mins).padStart(
    2,
    '0'
  )}`;
};


const roundUpToInterval = (
  minutes,
  interval
) => (
  Math.ceil(minutes / interval) *
  interval
);


const validateDate = (
  date,
  timezone
) => {
  const parsed =
    DateTime.fromISO(
      date,
      {
        zone: timezone,
      }
    );

  if (
    !parsed.isValid ||
    parsed.toFormat(
      'yyyy-MM-dd'
    ) !== date
  ) {
    throw new ApiError(
      400,
      'Invalid calendar date'
    );
  }

  return parsed;
};


const intersectShifts = (
  clinicShifts,
  dentistShifts
) => {
  const result = [];

  for (
    const clinicShift
    of clinicShifts
  ) {
    const clinicStart =
      timeToMinutes(
        clinicShift.start
      );

    const clinicEnd =
      timeToMinutes(
        clinicShift.end
      );


    for (
      const dentistShift
      of dentistShifts
    ) {
      const dentistStart =
        timeToMinutes(
          dentistShift.start
        );

      const dentistEnd =
        timeToMinutes(
          dentistShift.end
        );


      const start =
        Math.max(
          clinicStart,
          dentistStart
        );

      const end =
        Math.min(
          clinicEnd,
          dentistEnd
        );


      if (start < end) {
        result.push({
          start,
          end,
        });
      }
    }
  }


  return result.sort(
    (a, b) =>
      a.start - b.start
  );
};


const getDentistSchedule = async (
  dentist,
  date,
  weekday
) => {
  const exception =
    await DentistScheduleException
      .findOne({
        dentist: dentist._id,
        date,
      })
      .lean();


  if (exception) {
    return {
      source: 'exception',

      isWorking:
        exception.isWorking,

      shifts:
        exception.shifts || [],
    };
  }


  const normalDay =
    dentist.weeklySchedule.find(
      (day) =>
        day.dayOfWeek ===
        weekday
  );


  if (!normalDay) {
    return {
      source: 'weekly',

      isWorking: false,

      shifts: [],
    };
  }


  return {
    source: 'weekly',

    isWorking:
      normalDay.isWorking,

    shifts:
      normalDay.shifts || [],
  };
};


const buildOccupiedSet = async (
  dentistId,
  date,
  excludeAppointmentId = null
) => {
  const filter = {
      dentist: dentistId,

      date,

      status: {
        $ne: 'cancelled',
      },
    };

  if (excludeAppointmentId) {
    filter._id = {
      $ne: excludeAppointmentId,
    };
  }

  const appointments =
    await Appointment.find(filter)
      .select('+lockKeys')
      .lean();


  const occupied =
    new Set();


  for (
    const appointment
    of appointments
  ) {
    for (
      const key
      of appointment.lockKeys || []
    ) {
      if (
        !key.startsWith(
          `${date}:`
        )
      ) {
        continue;
      }

      const minute =
        Number(
          key.slice(
            date.length + 1
          )
        );

      if (
        Number.isInteger(
          minute
        )
      ) {
        occupied.add(
          minute
        );
      }
    }
  }


  return occupied;
};


const isRangeFree = (
  occupiedMinutes,
  start,
  end
) => {
  for (
    let minute = start;
    minute < end;
    minute += 1
  ) {
    if (
      occupiedMinutes.has(
        minute
      )
    ) {
      return false;
    }
  }

  return true;
};


const createEmptyResult = ({
  date,
  timezone,
  service,
  dentist,
  reason,
  bookingSettings,
}) => ({
  date,

  timezone,

  available: false,

  reason,

  dentist: {
    id: dentist._id,

    firstName:
      dentist.firstName,

    lastName:
      dentist.lastName,

    slug:
      dentist.slug,
  },

  service: {
    id: service._id,

    name:
      service.name,

    durationMinutes:
      service.durationMinutes,
  },

  rules: {
    slotIntervalMinutes:
      bookingSettings
        .slotIntervalMinutes,

    bufferMinutes:
      bookingSettings
        .bufferMinutes,

    minBookingNoticeMinutes:
      bookingSettings
        .minBookingNoticeMinutes,
  },

  slots: [],
});


const getAvailability = async ({
  dentistId,
  serviceId,
  date,
  excludeAppointmentId = null,
}) => {
  const clinic =
    await clinicService.getClinic();


  const timezone =
    clinic.timezone ||
    'Asia/Yerevan';


  const requestedDate =
    validateDate(
      date,
      timezone
    );


  const today =
    DateTime.now()
      .setZone(timezone)
      .startOf('day');


  const requestedDay =
    requestedDate.startOf(
      'day'
    );


  if (
    requestedDay <
    today
  ) {
    throw new ApiError(
      400,
      'Cannot book a date in the past'
    );
  }


  const bookingSettings =
    clinic.bookingSettings;


  if (
    !bookingSettings
      .isBookingEnabled
  ) {
    throw new ApiError(
      503,
      'Online booking is currently unavailable'
    );
  }


  const maxDate =
    today.plus({
      days:
        bookingSettings
          .maxBookingDaysAhead,
    });


  if (
    requestedDay >
    maxDate
  ) {
    throw new ApiError(
      400,
      `Booking is available up to ${bookingSettings.maxBookingDaysAhead} days ahead`
    );
  }


  const service =
    await Service.findOne({
      _id: serviceId,

      isActive: true,

      bookingEnabled: true,
    });


  if (!service) {
    throw new ApiError(
      404,
      'Service is not available for online booking'
    );
  }


  const dentist =
    await Dentist.findOne({
      _id: dentistId,

      isActive: true,

      bookingEnabled: true,
    });


  if (!dentist) {
    throw new ApiError(
      404,
      'Dentist is not available for online booking'
    );
  }


  const providesService =
    dentist.services.some(
      (id) =>
        String(id) ===
        String(service._id)
    );


  if (!providesService) {
    throw new ApiError(
      400,
      'This dentist does not provide the selected service'
    );
  }


  const isToday =
    requestedDay.hasSame(
      today,
      'day'
    );


  if (
    isToday &&
    !bookingSettings
      .allowSameDayBooking
  ) {
    return createEmptyResult({
      date,
      timezone,
      service,
      dentist,

      reason:
        'SAME_DAY_BOOKING_DISABLED',

      bookingSettings,
    });
  }


  const clinicSchedule =
    await clinicService
      .getEffectiveSchedule(
        date
      );


  if (
    !clinicSchedule.isOpen
  ) {
    return createEmptyResult({
      date,
      timezone,
      service,
      dentist,

      reason:
        'CLINIC_CLOSED',

      bookingSettings,
    });
  }


  const dentistSchedule =
    await getDentistSchedule(
      dentist,
      date,
      requestedDate.weekday
    );


  if (
    !dentistSchedule
      .isWorking
  ) {
    return createEmptyResult({
      date,
      timezone,
      service,
      dentist,

      reason:
        'DENTIST_NOT_WORKING',

      bookingSettings,
    });
  }


  const availableWindows =
    intersectShifts(
      clinicSchedule.shifts,
      dentistSchedule.shifts
    );


  if (
    availableWindows.length ===
    0
  ) {
    return createEmptyResult({
      date,
      timezone,
      service,
      dentist,

      reason:
        'NO_COMMON_WORKING_TIME',

      bookingSettings,
    });
  }


  const occupiedMinutes =
    await buildOccupiedSet(
      dentist._id,
      date,
      excludeAppointmentId
    );


  const interval =
    bookingSettings
      .slotIntervalMinutes;


  const duration =
    service.durationMinutes;


  const buffer =
    bookingSettings
      .bufferMinutes;


  const totalBlockedDuration =
    duration + buffer;


  const now =
    DateTime.now()
      .setZone(timezone);


  const earliestAllowed =
    now.plus({
      minutes:
        bookingSettings
          .minBookingNoticeMinutes,
    });


  const slots = [];


  for (
    const window
    of availableWindows
  ) {
    let startMinute =
      roundUpToInterval(
        window.start,
        interval
      );


    while (
      startMinute +
        totalBlockedDuration <=
      window.end
    ) {
      const blockedUntil =
        startMinute +
        totalBlockedDuration;


      const appointmentEnd =
        startMinute +
        duration;


      const startLocal =
        requestedDay.plus({
          minutes:
            startMinute,
        });


      if (
        startLocal <
        earliestAllowed
      ) {
        startMinute +=
          interval;

        continue;
      }


      if (
        !isRangeFree(
          occupiedMinutes,
          startMinute,
          blockedUntil
        )
      ) {
        startMinute +=
          interval;

        continue;
      }


      const endLocal =
        requestedDay.plus({
          minutes:
            appointmentEnd,
        });


      slots.push({
        start:
          minutesToTime(
            startMinute
          ),

        end:
          minutesToTime(
            appointmentEnd
          ),

        startAt:
          startLocal
            .toUTC()
            .toISO(),

        endAt:
          endLocal
            .toUTC()
            .toISO(),
      });


      startMinute +=
        interval;
    }
  }


  return {
    date,

    timezone,

    available:
      slots.length > 0,

    reason:
      slots.length > 0
        ? null
        : 'FULLY_BOOKED',

    dentist: {
      id:
        dentist._id,

      firstName:
        dentist.firstName,

      lastName:
        dentist.lastName,

      slug:
        dentist.slug,

      title:
        dentist.title,
    },

    service: {
      id:
        service._id,

      name:
        service.name,

      durationMinutes:
        service.durationMinutes,

      priceType:
        service.priceType,

      priceFrom:
        service.priceFrom,

      priceTo:
        service.priceTo,

      currency:
        service.currency,
    },

    rules: {
      slotIntervalMinutes:
        interval,

      bufferMinutes:
        buffer,

      minBookingNoticeMinutes:
        bookingSettings
          .minBookingNoticeMinutes,
    },

    schedule: {
      clinicSource:
        clinicSchedule.source,

      dentistSource:
        dentistSchedule.source,
    },

    slots,
  };
};


export {
  getAvailability,
};

