import { DateTime } from 'luxon';

import Clinic from './clinic.model.js';
import ClinicClosure from './clinicClosure.model.js';

import ApiError from '../../utils/ApiError.js';


const timeToMinutes = (time) => {
  const [hours, minutes] =
    time.split(':').map(Number);

  return hours * 60 + minutes;
};


const validateShifts = (
  shifts = []
) => {
  const sorted =
    [...shifts].sort(
      (a, b) =>
        timeToMinutes(a.start) -
        timeToMinutes(b.start)
    );

  for (
    let index = 0;
    index < sorted.length;
    index += 1
  ) {
    const shift =
      sorted[index];

    const start =
      timeToMinutes(
        shift.start
      );

    const end =
      timeToMinutes(
        shift.end
      );

    if (end <= start) {
      throw new ApiError(
        400,
        `Invalid shift ${shift.start}-${shift.end}`
      );
    }

    if (index > 0) {
      const previous =
        sorted[index - 1];

      if (
        timeToMinutes(
          shift.start
        ) <
        timeToMinutes(
          previous.end
        )
      ) {
        throw new ApiError(
          400,
          'Working shifts cannot overlap'
        );
      }
    }
  }

  return sorted;
};


const validateWeeklySchedule = (
  schedule = []
) => {
  const days =
    new Set();

  return schedule
    .map((day) => {
      if (
        days.has(
          day.dayOfWeek
        )
      ) {
        throw new ApiError(
          400,
          'Each weekday can appear only once'
        );
      }

      days.add(
        day.dayOfWeek
      );

      if (!day.isOpen) {
        return {
          dayOfWeek:
            day.dayOfWeek,

          isOpen: false,

          shifts: [],
        };
      }

      if (
        !day.shifts ||
        day.shifts.length === 0
      ) {
        throw new ApiError(
          400,
          'Open day must contain at least one shift'
        );
      }

      return {
        ...day,

        shifts:
          validateShifts(
            day.shifts
          ),
      };
    })
    .sort(
      (a, b) =>
        a.dayOfWeek -
        b.dayOfWeek
    );
};


const validateDate = (
  date
) => {
  const parsed =
    DateTime.fromISO(
      date,
      {
        zone: 'Asia/Yerevan',
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


const ensureClinic = async () => {
  let clinic =
    await Clinic.findOne({
      key: 'default',
    });

  if (!clinic) {
    clinic =
      await Clinic.create({
        key: 'default',
      });
  }

  return clinic;
};


const getClinic = async () => {
  const clinic =
    await ensureClinic();

  return clinic;
};


const updateClinic = async (
  data
) => {
  const clinic =
    await ensureClinic();

  if (
    data.weeklySchedule
  ) {
    clinic.weeklySchedule =
      validateWeeklySchedule(
        data.weeklySchedule
      );
  }

  if (
    data.bookingSettings
  ) {
    const current =
      clinic.bookingSettings
        ?.toObject?.() ||
      {};

    clinic.bookingSettings = {
      ...current,
      ...data.bookingSettings,
    };
  }

  if (data.socialLinks) {
    const current =
      clinic.socialLinks
        ?.toObject?.() ||
      {};

    clinic.socialLinks = {
      ...current,
      ...data.socialLinks,
    };
  }

  const protectedFields =
    new Set([
      'weeklySchedule',
      'bookingSettings',
      'socialLinks',
      'key',
      'timezone',
    ]);

  for (
    const [key, value]
    of Object.entries(data)
  ) {
    if (
      protectedFields.has(key)
    ) {
      continue;
    }

    clinic[key] = value;
  }

  await clinic.save();

  return clinic;
};


const upsertClosure = async (
  date,
  data
) => {
  validateDate(date);

  const payload = {
    ...data,

    shifts:
      data.isOpen
        ? validateShifts(
            data.shifts
          )
        : [],
  };

  if (
    payload.isOpen &&
    payload.shifts.length === 0
  ) {
    throw new ApiError(
      400,
      'Open day must contain at least one shift'
    );
  }

  return ClinicClosure
    .findOneAndUpdate(
      {
        date,
      },

      {
        date,
        ...payload,
      },

      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );
};


const getClosures = async (
  query = {}
) => {
  const filter = {};

  if (
    query.from ||
    query.to
  ) {
    filter.date = {};

    if (query.from) {
      validateDate(
        query.from
      );

      filter.date.$gte =
        query.from;
    }

    if (query.to) {
      validateDate(
        query.to
      );

      filter.date.$lte =
        query.to;
    }
  }

  return ClinicClosure
    .find(filter)
    .sort({
      date: 1,
    })
    .lean();
};


const deleteClosure = async (
  date
) => {
  validateDate(date);

  const closure =
    await ClinicClosure
      .findOneAndDelete({
        date,
      });

  if (!closure) {
    throw new ApiError(
      404,
      'Clinic schedule exception not found'
    );
  }

  return closure;
};


const getEffectiveSchedule =
  async (date) => {
    const parsed =
      validateDate(date);

    const exception =
      await ClinicClosure
        .findOne({
          date,
        })
        .lean();

    if (exception) {
      return {
        source:
          'exception',

        isOpen:
          exception.isOpen,

        shifts:
          exception.shifts || [],
      };
    }

    const clinic =
      await ensureClinic();

    const weekday =
      parsed.weekday;

    const normalDay =
      clinic.weeklySchedule
        .find(
          (day) =>
            day.dayOfWeek ===
            weekday
        );

    if (!normalDay) {
      return {
        source:
          'weekly',

        isOpen: false,

        shifts: [],
      };
    }

    return {
      source:
        'weekly',

      isOpen:
        normalDay.isOpen,

      shifts:
        normalDay.shifts,
    };
  };


export {
  getClinic,
  updateClinic,
  upsertClosure,
  getClosures,
  deleteClosure,
  getEffectiveSchedule,
};
