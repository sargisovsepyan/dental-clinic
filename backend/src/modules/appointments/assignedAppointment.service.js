import { DateTime } from 'luxon';
import User from '../users/user.model.js';
import Dentist from '../dentists/dentist.model.js';
import Appointment from './appointment.model.js';
import env from '../../config/env.js';
import ApiError from '../../utils/ApiError.js';

const fields = '_id patientName patientPhone date startTime endTime status serviceSnapshot';
const safeAppointment = (row) => ({
  _id: row._id, patientName: row.patientName, patientPhone: row.patientPhone,
  date: row.date, startTime: row.startTime, endTime: row.endTime, status: row.status,
  serviceSnapshot: {
    name: row.serviceSnapshot.name, durationMinutes: row.serviceSnapshot.durationMinutes,
    translations: Object.fromEntries(['hy', 'ru', 'en'].flatMap((locale) => {
      const name = row.serviceSnapshot.translations?.[locale]?.name;
      return typeof name === 'string' ? [[locale, { name }]] : [];
    })),
  },
});

const assignedProfile = async (userId, authenticatedVersion) => {
  const user = await User.findOne({ _id: userId, role: 'dentist', isActive: true, isSetupComplete: true })
    .select('+dentistProfile +authVersion').lean();
  if (!Number.isInteger(authenticatedVersion) || user?.authVersion !== authenticatedVersion ||
      !user?.dentistProfile || !await Dentist.exists({ _id: user.dentistProfile, isActive: true })) {
    throw new ApiError(403, 'A current doctor profile assignment is required', { code: 'DENTIST_PROFILE_REQUIRED' });
  }
  return { dentist: user.dentistProfile, authVersion: user.authVersion };
};

const assertAssignmentCurrent = async (userId, previous) => {
  const current = await assignedProfile(userId, previous.authVersion);
  if (String(current.dentist) !== String(previous.dentist) || current.authVersion !== previous.authVersion) {
    throw new ApiError(403, 'Care assignment changed; sign in again', { code: 'DENTIST_PROFILE_REQUIRED' });
  }
};

const getMyAppointments = async (userId, query, authenticatedVersion) => {
  const assignment = await assignedProfile(userId, authenticatedVersion);
  const { dentist } = assignment;
  const today = DateTime.now().setZone(env.CLINIC_TIMEZONE).toISODate();
  const filter = {
    dentist,
    date: query.date || { $gte: query.from || today, ...(query.to ? { $lte: query.to } : {}) },
  };
  const [rows, total] = await Promise.all([
    Appointment.find(filter).select(fields).sort({ date: 1, startTime: 1, _id: 1 })
      .skip((query.page - 1) * query.limit).limit(query.limit).lean(),
    Appointment.countDocuments(filter),
  ]);
  await assertAssignmentCurrent(userId, assignment);
  return {
    appointments: rows.map(safeAppointment),
    pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) },
    today, timezone: env.CLINIC_TIMEZONE,
  };
};

const getMyAppointment = async (userId, id, authenticatedVersion) => {
  const assignment = await assignedProfile(userId, authenticatedVersion);
  const { dentist } = assignment;
  // Ownership is in the database predicate, including the detail endpoint.
  const row = await Appointment.findOne({ _id: id, dentist }).select(fields).lean();
  if (!row) throw new ApiError(404, 'Appointment not found');
  await assertAssignmentCurrent(userId, assignment);
  return safeAppointment(row);
};

export { getMyAppointments, getMyAppointment };
