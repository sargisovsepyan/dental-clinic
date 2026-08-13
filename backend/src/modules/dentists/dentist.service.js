import { DateTime } from 'luxon';

import Dentist from './dentist.model.js';
import DentistScheduleException from './dentistScheduleException.model.js';

import Service from '../services/service.model.js';

import ApiError from '../../utils/ApiError.js';
import buildSlug from '../../utils/buildSlug.js';
import {
  mergeTranslations,
} from '../../i18n/localization.js';


const timeToMinutes = (time) => {
  const [hours, minutes] =
    time.split(':').map(Number);

  return hours * 60 + minutes;
};


const validateShifts = (shifts = []) => {
  const sorted = [...shifts].sort(
    (a, b) =>
      timeToMinutes(a.start) -
      timeToMinutes(b.start)
  );

  for (
    let index = 0;
    index < sorted.length;
    index += 1
  ) {
    const shift = sorted[index];

    const start =
      timeToMinutes(shift.start);

    const end =
      timeToMinutes(shift.end);

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
        timeToMinutes(shift.start) <
        timeToMinutes(previous.end)
      ) {
        throw new ApiError(
          400,
          'Schedule shifts cannot overlap'
        );
      }
    }
  }

  return sorted;
};


const validateWeeklySchedule = (
  schedule = []
) => {
  const usedDays = new Set();

  const normalized =
    schedule.map((day) => {
      if (
        usedDays.has(day.dayOfWeek)
      ) {
        throw new ApiError(
          400,
          'Each weekday can appear only once'
        );
      }

      usedDays.add(day.dayOfWeek);

      if (!day.isWorking) {
        return {
          dayOfWeek:
            day.dayOfWeek,

          isWorking: false,

          shifts: [],
        };
      }

      if (
        !day.shifts ||
        day.shifts.length === 0
      ) {
        throw new ApiError(
          400,
          'Working day must contain at least one shift'
        );
      }

      return {
        ...day,
        shifts:
          validateShifts(day.shifts),
      };
    });

  return normalized.sort(
    (a, b) =>
      a.dayOfWeek - b.dayOfWeek
  );
};


const ensureServicesExist = async (
  ids = []
) => {
  if (!ids.length) {
    return;
  }

  const uniqueIds = [
    ...new Set(
      ids.map(String)
    ),
  ];

  const count =
    await Service.countDocuments({
      _id: {
        $in: uniqueIds,
      },

      isActive: true,
    });

  if (count !== uniqueIds.length) {
    throw new ApiError(
      400,
      'One or more selected services are unavailable'
    );
  }
};


const createDentist = async (
  data
) => {
  await ensureServicesExist(
    data.services
  );

  const slug =
    data.slug ||
    buildSlug(
      `${data.firstName}-${data.lastName}`
    );

  const duplicate =
    await Dentist.findOne({
      slug,
    });

  if (duplicate) {
    throw new ApiError(
      409,
      'Dentist with this slug already exists'
    );
  }

  const weeklySchedule =
    validateWeeklySchedule(
      data.weeklySchedule
    );

  const primary =
    data.translations?.hy;

  return Dentist.create({
    ...data,
    title:
      data.title ??
      primary?.title ??
      '',
    bio:
      data.bio ??
      primary?.bio ??
      '',
    specializations:
      data.specializations ??
      primary?.specializations ??
      [],
    slug,
    weeklySchedule,
  });
};


const getPublicDentists = async (
  query = {}
) => {
  const filter = {
    isActive: true,
  };

  if (
    query.featured !== undefined
  ) {
    filter.isFeatured =
      query.featured;
  }

  if (
    query.bookingEnabled !==
    undefined
  ) {
    filter.bookingEnabled =
      query.bookingEnabled;
  }

  if (query.service) {
    filter.services =
      query.service;
  }

  return Dentist.find(filter)
    .populate({
      path: 'services',
      match: {
        isActive: true,
      },
      select:
        'name slug translations durationMinutes priceType priceFrom priceTo currency bookingEnabled',
    })
    .sort({
      sortOrder: 1,
      lastName: 1,
      firstName: 1,
    })
    .lean();
};


const getAdminDentists = async () => {
  return Dentist.find()
    .populate(
      'services',
      'name slug translations isActive bookingEnabled'
    )
    .sort({
      sortOrder: 1,
      lastName: 1,
      firstName: 1,
    })
    .lean();
};


const getDentistBySlug = async (
  slug
) => {
  const dentist =
    await Dentist.findOne({
      slug,
      isActive: true,
    })
      .populate({
        path: 'services',
        match: {
          isActive: true,
        },
        select:
          'name slug translations shortDescription durationMinutes priceType priceFrom priceTo currency bookingEnabled',
      })
      .lean();

  if (!dentist) {
    throw new ApiError(
      404,
      'Dentist not found'
    );
  }

  return dentist;
};


const updateDentist = async (
  id,
  data
) => {
  const dentist =
    await Dentist.findById(id);

  if (!dentist) {
    throw new ApiError(
      404,
      'Dentist not found'
    );
  }

  if (data.services) {
    await ensureServicesExist(
      data.services
    );
  }

  if (data.weeklySchedule) {
    data.weeklySchedule =
      validateWeeklySchedule(
        data.weeklySchedule
      );
  }

  if (data.translations) {
    dentist.translations =
      mergeTranslations(
        dentist.translations,
        data.translations
      );

    delete data.translations;
  }

  Object.assign(
    dentist,
    data
  );

  await dentist.save();

  return dentist.populate(
    'services',
    'name slug translations isActive bookingEnabled'
  );
};


const disableDentist = async (
  id
) => {
  const dentist =
    await Dentist.findByIdAndUpdate(
      id,
      {
        isActive: false,
        bookingEnabled: false,
      },
      {
        returnDocument: 'after',
        runValidators: true,
      }
    );

  if (!dentist) {
    throw new ApiError(
      404,
      'Dentist not found'
    );
  }

  return dentist;
};


const restoreDentist = async (
  id
) => {
  const dentist =
    await Dentist.findById(id);

  if (!dentist) {
    throw new ApiError(
      404,
      'Dentist not found'
    );
  }

  dentist.isActive = true;
  await dentist.save();

  return dentist;
};


const validateLocalDate = (
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
    parsed.toFormat('yyyy-MM-dd') !==
      date
  ) {
    throw new ApiError(
      400,
      'Invalid calendar date'
    );
  }
};


const upsertScheduleException =
  async (
    dentistId,
    date,
    data
  ) => {
    validateLocalDate(date);

    const dentist =
      await Dentist.findById(
        dentistId
      );

    if (!dentist) {
      throw new ApiError(
        404,
        'Dentist not found'
      );
    }

    const payload = {
      ...data,
      shifts: data.isWorking
        ? validateShifts(
            data.shifts
          )
        : [],
    };

    if (
      payload.isWorking &&
      payload.shifts.length === 0
    ) {
      throw new ApiError(
        400,
        'Working exception must contain at least one shift'
      );
    }

    return DentistScheduleException
      .findOneAndUpdate(
        {
          dentist: dentistId,
          date,
        },

        {
          dentist: dentistId,
          date,
          ...payload,
        },

        {
          returnDocument: 'after',
          upsert: true,
          runValidators: true,
          setDefaultsOnInsert: true,
        }
      );
  };


const getScheduleExceptions =
  async (
    dentistId,
    query = {}
  ) => {
    const dentist =
      await Dentist.exists({
        _id: dentistId,
      });

    if (!dentist) {
      throw new ApiError(
        404,
        'Dentist not found'
      );
    }

    const filter = {
      dentist: dentistId,
    };

    if (query.from || query.to) {
      filter.date = {};

      if (query.from) {
        validateLocalDate(
          query.from
        );

        filter.date.$gte =
          query.from;
      }

      if (query.to) {
        validateLocalDate(
          query.to
        );

        filter.date.$lte =
          query.to;
      }
    }

    return DentistScheduleException
      .find(filter)
      .sort({
        date: 1,
      })
      .lean();
  };


const deleteScheduleException =
  async (
    dentistId,
    date
  ) => {
    validateLocalDate(date);

    const exception =
      await DentistScheduleException
        .findOneAndDelete({
          dentist: dentistId,
          date,
        });

    if (!exception) {
      throw new ApiError(
        404,
        'Schedule exception not found'
      );
    }

    return exception;
  };


export {
  createDentist,
  getPublicDentists,
  getAdminDentists,
  getDentistBySlug,
  updateDentist,
  disableDentist,
  restoreDentist,
  upsertScheduleException,
  getScheduleExceptions,
  deleteScheduleException,
};
