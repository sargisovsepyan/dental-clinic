import { DateTime } from 'luxon';

import Clinic from './clinic.model.js';
import ClinicClosure from './clinicClosure.model.js';

import ApiError from '../../utils/ApiError.js';
import env from '../../config/env.js';
import runTransaction from '../../utils/runTransaction.js';
import {
  buildTranslationSet,
  synchronizePrimaryFields,
} from '../../i18n/localization.js';
import {
  assertScheduleMutationAllowed,
  findClinicScheduleConflicts,
} from '../appointments/scheduleConflict.service.js';

const LOCALIZED_FIELDS = Object.freeze([
  'clinicName',
  'tagline',
  'description',
  'address',
]);


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
        zone: env.CLINIC_TIMEZONE,
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


const ensureClinic = async ({
  session = null,
  includeBookingGuard = false,
} = {}) => {
  const query = Clinic.findOneAndUpdate(
    {
      key: 'default',
    },
    {
      $setOnInsert: {
        key: 'default',
        clinicName:
          'Ատամնաբուժական կլինիկա',
        translations: {
          hy: {
            clinicName:
              'Ատամնաբուժական կլինիկա',
          },
        },
      },
    },
    {
      upsert: true,
      returnDocument: 'after',
      setDefaultsOnInsert: true,
      runValidators: true,
      session,
    }
  );
  if (includeBookingGuard) {
    query.select('+bookingGuardVersion');
  }
  const clinic = await query;

  if (clinic.timezone !== env.CLINIC_TIMEZONE) {
    await Clinic.collection.updateOne(
      { _id: clinic._id },
      { $set: { timezone: env.CLINIC_TIMEZONE } },
      { session }
    );
    const refreshed = Clinic.findById(clinic._id).session(session);
    if (includeBookingGuard) {
      refreshed.select('+bookingGuardVersion');
    }
    return refreshed;
  }

  return clinic;
};


const getClinic = async (options = {}) => {
  const clinic =
    await ensureClinic(options);

  return clinic;
};


const updateClinic = async (
  data
) => {
  const {
    expectedScheduleRevision,
    scheduleConflictAcknowledgement,
    ...changes
  } = data;
  const normalized = synchronizePrimaryFields(
    changes,
    LOCALIZED_FIELDS,
    'Clinic'
  );
  const set = buildTranslationSet(normalized.translations);
  const primary =
    normalized.translations?.hy;

  for (const field of LOCALIZED_FIELDS) {
    if (primary?.[field] !== undefined) {
      set[field] = primary[field];
    }
  }

  if (normalized.weeklySchedule) {
    set.weeklySchedule = validateWeeklySchedule(
      normalized.weeklySchedule
    );
  }

  for (const [field, value] of Object.entries(
    normalized.bookingSettings || {}
  )) {
    set[`bookingSettings.${field}`] = value;
  }

  for (const [field, value] of Object.entries(
    normalized.socialLinks || {}
  )) {
    set[`socialLinks.${field}`] = value;
  }

  const protectedFields = new Set([
    ...LOCALIZED_FIELDS,
    'weeklySchedule',
    'bookingSettings',
    'socialLinks',
    'translations',
    'key',
    'timezone',
  ]);
  for (const [field, value] of Object.entries(normalized)) {
    if (!protectedFields.has(field)) {
      set[field] = value;
    }
  }

  const scheduleMutation = normalized.weeklySchedule !== undefined;
  const bookingMutation = scheduleMutation || normalized.bookingSettings !== undefined;

  const apply = async (session = null) => {
    const clinic = await ensureClinic({
      session,
      includeBookingGuard: bookingMutation,
    });
    if (scheduleMutation) {
      const conflicts = await findClinicScheduleConflicts({
        clinic,
        proposedWeeklySchedule: set.weeklySchedule,
        session,
      });
      assertScheduleMutationAllowed({
        currentRevision: clinic.scheduleRevision,
        expectedRevision: expectedScheduleRevision,
        acknowledgementToken: scheduleConflictAcknowledgement,
        scope: 'clinic-weekly-schedule',
        proposal: set.weeklySchedule,
        conflicts,
      });
    }

    const updated = await Clinic.findOneAndUpdate(
      {
        _id: clinic._id,
        ...(scheduleMutation
          ? { scheduleRevision: expectedScheduleRevision }
          : {}),
        ...(bookingMutation
          ? { bookingGuardVersion: clinic.bookingGuardVersion }
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
    );
    if (!updated) {
      throw new ApiError(409, 'Clinic settings changed; reload and try again', {
        code: 'SCHEDULE_REVISION_CONFLICT',
      });
    }
    return updated;
  };

  return scheduleMutation || bookingMutation
    ? runTransaction(apply)
    : apply();
};


const upsertClosure = async (
  date,
  data
) => {
  validateDate(date);

  const {
    expectedScheduleRevision,
    scheduleConflictAcknowledgement,
    ...changes
  } = data;

  const payload = {
    ...changes,

    shifts:
      changes.isOpen
        ? validateShifts(
            changes.shifts
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

  return runTransaction(async (session) => {
    const clinic = await ensureClinic({
      session,
      includeBookingGuard: true,
    });
    const conflicts = await findClinicScheduleConflicts({
      clinic,
      exceptionDate: date,
      proposedException: payload,
      session,
    });
    assertScheduleMutationAllowed({
      currentRevision: clinic.scheduleRevision,
      expectedRevision: expectedScheduleRevision,
      acknowledgementToken: scheduleConflictAcknowledgement,
      scope: `clinic-exception:${date}`,
      proposal: payload,
      conflicts,
    });

    const guarded = await Clinic.updateOne(
      {
        _id: clinic._id,
        scheduleRevision: expectedScheduleRevision,
        bookingGuardVersion: clinic.bookingGuardVersion,
      },
      {
        $inc: { scheduleRevision: 1, bookingGuardVersion: 1 },
      },
      { session }
    );
    if (guarded.modifiedCount !== 1) {
      throw new ApiError(409, 'Clinic schedule changed; reload and try again', {
        code: 'SCHEDULE_REVISION_CONFLICT',
      });
    }

    return ClinicClosure.findOneAndUpdate(
      {
        date,
      },

      {
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
  date,
  options = {}
) => {
  validateDate(date);

  return runTransaction(async (session) => {
    const clinic = await ensureClinic({
      session,
      includeBookingGuard: true,
    });
    const closure = await ClinicClosure.findOne({ date }).session(session);
    if (!closure) {
      throw new ApiError(404, 'Clinic schedule exception not found');
    }
    const conflicts = await findClinicScheduleConflicts({
      clinic,
      exceptionDate: date,
      proposedException: null,
      session,
    });
    assertScheduleMutationAllowed({
      currentRevision: clinic.scheduleRevision,
      expectedRevision: options.expectedScheduleRevision,
      acknowledgementToken: options.scheduleConflictAcknowledgement,
      scope: `clinic-exception-delete:${date}`,
      proposal: null,
      conflicts,
    });
    const guarded = await Clinic.updateOne(
      {
        _id: clinic._id,
        scheduleRevision: options.expectedScheduleRevision,
        bookingGuardVersion: clinic.bookingGuardVersion,
      },
      { $inc: { scheduleRevision: 1, bookingGuardVersion: 1 } },
      { session }
    );
    if (guarded.modifiedCount !== 1) {
      throw new ApiError(409, 'Clinic schedule changed; reload and try again', {
        code: 'SCHEDULE_REVISION_CONFLICT',
      });
    }
    await ClinicClosure.deleteOne({ _id: closure._id }, { session });
    return closure;
  });
};


const getEffectiveSchedule =
  async (date, { clinic: suppliedClinic = null, session = null } = {}) => {
    const parsed =
      validateDate(date);

    const exception =
      await ClinicClosure
        .findOne({
          date,
        })
        .session(session)
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

    const clinic = suppliedClinic || await ensureClinic({ session });

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
