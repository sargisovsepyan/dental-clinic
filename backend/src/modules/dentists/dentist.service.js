import { DateTime } from 'luxon';

import Dentist from './dentist.model.js';
import DentistScheduleException from './dentistScheduleException.model.js';

import Service from '../services/service.model.js';
import ServiceCategory from '../serviceCategories/serviceCategory.model.js';

import ApiError from '../../utils/ApiError.js';
import { buildCanonicalSlug } from '../../utils/buildSlug.js';
import {
  buildTranslationSet,
  synchronizePrimaryFields,
} from '../../i18n/localization.js';
import env from '../../config/env.js';
import runTransaction from '../../utils/runTransaction.js';
import {
  assertScheduleMutationAllowed,
  findDentistScheduleConflicts,
} from '../appointments/scheduleConflict.service.js';

const LOCALIZED_FIELDS = Object.freeze([
  'title',
  'bio',
  'specializations',
]);
const UPDATE_FIELDS = new Set([
  'firstName',
  'lastName',
  ...LOCALIZED_FIELDS,
  'translations',
  'experienceYears',
  'languages',
  'services',
  'weeklySchedule',
  'isFeatured',
  'bookingEnabled',
  'sortOrder',
]);

const assertUpdateFields = (data) => {
  const unsupported = Object.keys(data)
    .find((field) => !UPDATE_FIELDS.has(field));
  if (unsupported) {
    throw new ApiError(400, `${unsupported} cannot be changed by dentist update`);
  }
};


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
  ids = [],
  session = null
) => {
  if (!ids.length) {
    return;
  }

  const uniqueIds = [
    ...new Set(
      ids.map(String)
    ),
  ];

  const services =
    await Service.find({
      _id: {
        $in: uniqueIds,
      },

      isActive: true,
    })
      .select('_id category')
      .session(session)
      .lean();

  const activeCategoryIds = new Set(
    (await ServiceCategory.find({
      _id: {
        $in: services.map(({ category }) => category),
      },
      isActive: true,
    }).session(session).distinct('_id')).map(String)
  );

  if (
    services.length !== uniqueIds.length ||
    services.some(({ category }) => !activeCategoryIds.has(String(category)))
  ) {
    throw new ApiError(
      400,
      'One or more selected services are unavailable'
    );
  }
};

const getPublicServiceIds = async () => {
  const services = await Service.find({ isActive: true })
    .select('_id category')
    .lean();
  const activeCategoryIds = new Set(
    (await ServiceCategory.find({
      _id: { $in: services.map(({ category }) => category) },
      isActive: true,
    }).distinct('_id')).map(String)
  );

  return services
    .filter(({ category }) => activeCategoryIds.has(String(category)))
    .map(({ _id }) => _id);
};


const createDentist = async (
  data
) => {
  await ensureServicesExist(
    data.services
  );

  const normalized = synchronizePrimaryFields(
    data,
    LOCALIZED_FIELDS,
    'Dentist'
  );
  const slug = buildCanonicalSlug({
    explicit: normalized.slug,
    fallback: `${normalized.firstName}-${normalized.lastName}`,
  });

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
      normalized.weeklySchedule
    );

  const primary =
    normalized.translations?.hy;

  if (normalized.isActive === false) {
    normalized.bookingEnabled = false;
    normalized.isFeatured = false;
  }

  return Dentist.create({
    ...normalized,
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
  const publicServiceIds =
    await getPublicServiceIds();
  const publicServiceIdSet = new Set(
    publicServiceIds.map(String)
  );

  if (
    query.service &&
    !publicServiceIdSet.has(String(query.service))
  ) {
    return [];
  }

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
        _id: { $in: publicServiceIds },
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
  const publicServiceIds =
    await getPublicServiceIds();
  const dentist =
    await Dentist.findOne({
      slug,
      isActive: true,
    })
      .populate({
        path: 'services',
        match: {
          isActive: true,
          _id: { $in: publicServiceIds },
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
  const {
    expectedScheduleRevision,
    scheduleConflictAcknowledgement,
    ...changes
  } = data;
  assertUpdateFields(changes);

  const normalized = synchronizePrimaryFields(
    changes,
    LOCALIZED_FIELDS,
    'Dentist'
  );

  if (normalized.weeklySchedule) {
    normalized.weeklySchedule =
      validateWeeklySchedule(
        normalized.weeklySchedule
      );
  }

  const set = buildTranslationSet(
    normalized.translations
  );
  const primary =
    normalized.translations?.hy;
  for (const field of LOCALIZED_FIELDS) {
    if (primary?.[field] !== undefined) {
      set[field] = primary[field];
    }
  }

  for (const field of UPDATE_FIELDS) {
    if (
      !LOCALIZED_FIELDS.includes(field) &&
      field !== 'translations' &&
      normalized[field] !== undefined
    ) {
      set[field] = normalized[field];
    }
  }

  const scheduleMutation = normalized.weeklySchedule !== undefined;
  const bookingMutation = scheduleMutation ||
    normalized.services !== undefined ||
    normalized.bookingEnabled !== undefined;

  const apply = async (session = null) => {
    const dentist = await Dentist.findById(id)
      .select(bookingMutation ? '+bookingGuardVersion' : '')
      .session(session);
    if (!dentist) {
      throw new ApiError(404, 'Dentist not found');
    }
    if (
      !dentist.isActive &&
      (changes.bookingEnabled === true || changes.isFeatured === true)
    ) {
      throw new ApiError(
        409,
        'Restore the dentist before enabling booking or featuring the profile'
      );
    }
    if (normalized.services) {
      await ensureServicesExist(normalized.services, session);
    }
    if (scheduleMutation) {
      const conflicts = await findDentistScheduleConflicts({
        dentist,
        proposedWeeklySchedule: normalized.weeklySchedule,
        session,
      });
      assertScheduleMutationAllowed({
        currentRevision: dentist.scheduleRevision,
        expectedRevision: expectedScheduleRevision,
        acknowledgementToken: scheduleConflictAcknowledgement,
        scope: `dentist-weekly-schedule:${dentist._id}`,
        proposal: normalized.weeklySchedule,
        conflicts,
      });
    }

    const updated = await Dentist.findOneAndUpdate(
      {
        _id: id,
        ...(changes.bookingEnabled === true || changes.isFeatured === true
          ? { isActive: true }
          : {}),
        ...(scheduleMutation
          ? { scheduleRevision: expectedScheduleRevision }
          : {}),
        ...(bookingMutation
          ? { bookingGuardVersion: dentist.bookingGuardVersion }
          : {}),
      },
      {
        $set: set,
        ...((scheduleMutation || bookingMutation) && {
          $inc: {
            ...(scheduleMutation ? { scheduleRevision: 1 } : {}),
            ...(bookingMutation ? { bookingGuardVersion: 1 } : {}),
          },
        }),
      },
      { returnDocument: 'after', runValidators: true, session }
    ).populate('services', 'name slug translations isActive bookingEnabled');

    if (!updated) {
      if (!await Dentist.exists({ _id: id }).session(session)) {
        throw new ApiError(404, 'Dentist not found');
      }
      throw new ApiError(
        409,
        'Dentist lifecycle or schedule changed while the update was in progress'
      );
    }
    return updated;
  };

  return bookingMutation ? runTransaction(apply) : apply();
};


const disableDentist = async (
  id
) => {
  const dentist =
    await Dentist.findByIdAndUpdate(
      id,
      {
        $set: {
          isActive: false,
          bookingEnabled: false,
          isFeatured: false,
        },
        $inc: { bookingGuardVersion: 1 },
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

  await ensureServicesExist(
    dentist.services
  );
  return Dentist.findOneAndUpdate(
    { _id: dentist._id },
    {
      $set: {
        isActive: true,
        bookingEnabled: false,
        isFeatured: false,
      },
      $inc: { bookingGuardVersion: 1 },
    },
    { returnDocument: 'after', runValidators: true }
  );
};


const validateLocalDate = (
  date
) => {
  const parsed =
    DateTime.fromISO(
      date,
      {
        zone: env.CLINIC_TIMEZONE,
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

    const {
      expectedScheduleRevision,
      scheduleConflictAcknowledgement,
      ...changes
    } = data;

    const payload = {
      ...changes,
      shifts: changes.isWorking
        ? validateShifts(
            changes.shifts
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

    return runTransaction(async (session) => {
      const dentist = await Dentist.findById(dentistId)
        .select('+bookingGuardVersion')
        .session(session);
      if (!dentist) {
        throw new ApiError(404, 'Dentist not found');
      }
      const conflicts = await findDentistScheduleConflicts({
        dentist,
        exceptionDate: date,
        proposedException: payload,
        session,
      });
      assertScheduleMutationAllowed({
        currentRevision: dentist.scheduleRevision,
        expectedRevision: expectedScheduleRevision,
        acknowledgementToken: scheduleConflictAcknowledgement,
        scope: `dentist-exception:${dentist._id}:${date}`,
        proposal: payload,
        conflicts,
      });
      const guarded = await Dentist.updateOne(
        {
          _id: dentist._id,
          scheduleRevision: expectedScheduleRevision,
          bookingGuardVersion: dentist.bookingGuardVersion,
        },
        { $inc: { scheduleRevision: 1, bookingGuardVersion: 1 } },
        { session }
      );
      if (guarded.modifiedCount !== 1) {
        throw new ApiError(409, 'Dentist schedule changed; reload and try again', {
          code: 'SCHEDULE_REVISION_CONFLICT',
        });
      }
      return DentistScheduleException.findOneAndUpdate(
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
          session,
        }
      );
    });
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
    date,
    options = {}
  ) => {
    validateLocalDate(date);

    return runTransaction(async (session) => {
      const dentist = await Dentist.findById(dentistId)
        .select('+bookingGuardVersion')
        .session(session);
      const exception = await DentistScheduleException.findOne({
        dentist: dentistId,
        date,
      }).session(session);
      if (!dentist) {
        throw new ApiError(404, 'Dentist not found');
      }
      if (!exception) {
        throw new ApiError(404, 'Schedule exception not found');
      }
      const conflicts = await findDentistScheduleConflicts({
        dentist,
        exceptionDate: date,
        proposedException: null,
        session,
      });
      assertScheduleMutationAllowed({
        currentRevision: dentist.scheduleRevision,
        expectedRevision: options.expectedScheduleRevision,
        acknowledgementToken: options.scheduleConflictAcknowledgement,
        scope: `dentist-exception-delete:${dentist._id}:${date}`,
        proposal: null,
        conflicts,
      });
      const guarded = await Dentist.updateOne(
        {
          _id: dentist._id,
          scheduleRevision: options.expectedScheduleRevision,
          bookingGuardVersion: dentist.bookingGuardVersion,
        },
        { $inc: { scheduleRevision: 1, bookingGuardVersion: 1 } },
        { session }
      );
      if (guarded.modifiedCount !== 1) {
        throw new ApiError(409, 'Dentist schedule changed; reload and try again', {
          code: 'SCHEDULE_REVISION_CONFLICT',
        });
      }
      await DentistScheduleException.deleteOne(
        { _id: exception._id },
        { session }
      );
      return exception;
    });
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
