import crypto from 'crypto';
import { DateTime } from 'luxon';

import Appointment from './appointment.model.js';
import ClinicClosure from '../clinic/clinicClosure.model.js';
import DentistScheduleException from '../dentists/dentistScheduleException.model.js';
import ApiError from '../../utils/ApiError.js';
import env from '../../config/env.js';


const MAX_SCHEDULE_APPOINTMENTS_SCANNED = 10_000;
const MAX_SCHEDULE_CONFLICTS_RETURNED = 25;


const stableValue = (value) => {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])])
    );
  }
  return value;
};


const timeToMinutes = (value) => {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''))) {
    return null;
  }
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
};


const appointmentFitsDay = (appointment, day, openField) => {
  if (!day?.[openField]) {
    return false;
  }
  const start = timeToMinutes(appointment.startTime);
  const end = timeToMinutes(appointment.endTime);
  const buffer = appointment.bufferMinutes;
  if (
    start === null || end === null || !Number.isInteger(buffer) ||
    buffer < 0 || end <= start
  ) {
    return false;
  }
  return (day.shifts || []).some((shift) => (
    timeToMinutes(shift.start) <= start &&
    end + buffer <= timeToMinutes(shift.end)
  ));
};


const weeklyDay = (schedule, date, openField) => {
  const weekday = DateTime.fromISO(date, {
    zone: env.CLINIC_TIMEZONE,
  }).weekday;
  return (schedule || []).find((day) => day.dayOfWeek === weekday) || {
    [openField]: false,
    shifts: [],
  };
};


const loadAppointments = async (filter, session) => {
  const appointments = await Appointment.find({
    ...filter,
    status: { $ne: 'cancelled' },
  })
    .select('_id dentist date startTime endTime bufferMinutes status')
    .sort({ date: 1, startTime: 1, _id: 1 })
    .limit(MAX_SCHEDULE_APPOINTMENTS_SCANNED + 1)
    .session(session)
    .lean();

  if (appointments.length > MAX_SCHEDULE_APPOINTMENTS_SCANNED) {
    throw new ApiError(
      409,
      'Too many future appointments to verify this schedule change safely',
      { code: 'SCHEDULE_CONFLICT_SCAN_LIMIT' }
    );
  }
  return appointments;
};


const conflictSummary = (appointment) => ({
  appointmentId: appointment._id,
  date: appointment.date,
  startTime: appointment.startTime,
  endTime: appointment.endTime,
  dentistId: appointment.dentist,
  status: appointment.status,
});


const buildAcknowledgementToken = ({
  scope,
  expectedRevision,
  proposal,
  conflicts,
}) => crypto
  .createHash('sha256')
  .update('schedule-conflict-acknowledgement\0', 'utf8')
  .update(JSON.stringify(stableValue({
    scope,
    expectedRevision,
    proposal,
    appointmentIds: conflicts.map(({ _id }) => String(_id)).sort(),
  })), 'utf8')
  .digest('hex');


const assertScheduleMutationAllowed = ({
  currentRevision,
  expectedRevision,
  acknowledgementToken,
  scope,
  proposal,
  conflicts,
}) => {
  if (currentRevision !== expectedRevision) {
    throw new ApiError(
      409,
      'Schedule changed; reload and review the latest schedule',
      {
        code: 'SCHEDULE_REVISION_CONFLICT',
        details: { currentScheduleRevision: currentRevision },
      }
    );
  }
  if (conflicts.length === 0) {
    return;
  }

  const exactToken = buildAcknowledgementToken({
    scope,
    expectedRevision,
    proposal,
    conflicts,
  });
  if (acknowledgementToken !== exactToken) {
    throw new ApiError(
      409,
      'Schedule change affects existing appointments and requires exact acknowledgement',
      {
        code: 'SCHEDULE_CONFLICT_ACKNOWLEDGEMENT_REQUIRED',
        details: {
          currentScheduleRevision: currentRevision,
          conflictCount: conflicts.length,
          conflicts: conflicts
            .slice(0, MAX_SCHEDULE_CONFLICTS_RETURNED)
            .map(conflictSummary),
          conflictsTruncated:
            conflicts.length > MAX_SCHEDULE_CONFLICTS_RETURNED,
          acknowledgementToken: exactToken,
        },
      }
    );
  }
};


const findClinicScheduleConflicts = async ({
  clinic,
  proposedWeeklySchedule = null,
  exceptionDate = null,
  proposedException = undefined,
  session,
}) => {
  const today = DateTime.now()
    .setZone(env.CLINIC_TIMEZONE)
    .toFormat('yyyy-MM-dd');
  const appointments = await loadAppointments(
    exceptionDate
      ? { date: exceptionDate }
      : { date: { $gte: today } },
    session
  );
  if (appointments.length === 0) {
    return [];
  }

  const dates = [...new Set(appointments.map(({ date }) => date))];
  const exceptions = await ClinicClosure.find({ date: { $in: dates } })
    .session(session)
    .lean();
  const byDate = new Map(exceptions.map((item) => [item.date, item]));

  return appointments.filter((appointment) => {
    const currentException = byDate.get(appointment.date);
    const currentDay = currentException || weeklyDay(
      clinic.weeklySchedule,
      appointment.date,
      'isOpen'
    );
    let proposedDay;
    if (exceptionDate) {
      proposedDay = proposedException === null
        ? weeklyDay(clinic.weeklySchedule, appointment.date, 'isOpen')
        : proposedException;
    }
    else {
      proposedDay = currentException || weeklyDay(
        proposedWeeklySchedule,
        appointment.date,
        'isOpen'
      );
    }
    return (
      appointmentFitsDay(appointment, currentDay, 'isOpen') &&
      !appointmentFitsDay(appointment, proposedDay, 'isOpen')
    );
  });
};


const findDentistScheduleConflicts = async ({
  dentist,
  proposedWeeklySchedule = null,
  exceptionDate = null,
  proposedException = undefined,
  session,
}) => {
  const today = DateTime.now()
    .setZone(env.CLINIC_TIMEZONE)
    .toFormat('yyyy-MM-dd');
  const appointments = await loadAppointments({
    dentist: dentist._id,
    ...(exceptionDate
      ? { date: exceptionDate }
      : { date: { $gte: today } }),
  }, session);
  if (appointments.length === 0) {
    return [];
  }

  const dates = [...new Set(appointments.map(({ date }) => date))];
  const exceptions = await DentistScheduleException.find({
    dentist: dentist._id,
    date: { $in: dates },
  })
    .session(session)
    .lean();
  const byDate = new Map(exceptions.map((item) => [item.date, item]));

  return appointments.filter((appointment) => {
    const currentException = byDate.get(appointment.date);
    const currentDay = currentException || weeklyDay(
      dentist.weeklySchedule,
      appointment.date,
      'isWorking'
    );
    let proposedDay;
    if (exceptionDate) {
      proposedDay = proposedException === null
        ? weeklyDay(dentist.weeklySchedule, appointment.date, 'isWorking')
        : proposedException;
    }
    else {
      proposedDay = currentException || weeklyDay(
        proposedWeeklySchedule,
        appointment.date,
        'isWorking'
      );
    }
    return (
      appointmentFitsDay(appointment, currentDay, 'isWorking') &&
      !appointmentFitsDay(appointment, proposedDay, 'isWorking')
    );
  });
};


export {
  MAX_SCHEDULE_APPOINTMENTS_SCANNED,
  MAX_SCHEDULE_CONFLICTS_RETURNED,
  assertScheduleMutationAllowed,
  findClinicScheduleConflicts,
  findDentistScheduleConflicts,
};
