import { DateTime } from 'luxon';

import Clinic from '../src/modules/clinic/clinic.model.js';
import ServiceCategory from '../src/modules/serviceCategories/serviceCategory.model.js';
import Service from '../src/modules/services/service.model.js';
import Dentist from '../src/modules/dentists/dentist.model.js';
import User from '../src/modules/users/user.model.js';
import generateToken from '../src/utils/generateToken.js';

const fullWeek = (field, shifts) => Array.from(
  { length: 7 },
  (_, index) => ({
    dayOfWeek: index + 1,
    [field]: true,
    shifts: shifts.map((shift) => ({ ...shift })),
  }),
);

export const futureDate = (days = 14) => DateTime.now()
  .setZone('Asia/Yerevan')
  .plus({ days })
  .toFormat('yyyy-MM-dd');

export const seedCore = async ({
  durationMinutes = 60,
  slotIntervalMinutes = 30,
  bufferMinutes = 0,
  requireEmail = false,
  clinicShifts = [{ start: '09:00', end: '18:00' }],
  dentistShifts = [{ start: '09:00', end: '18:00' }],
} = {}) => {
  const clinic = await Clinic.create({
    key: 'default',
    timezone: 'Asia/Yerevan',
    weeklySchedule: fullWeek('isOpen', clinicShifts),
    bookingSettings: {
      isBookingEnabled: true,
      slotIntervalMinutes,
      minBookingNoticeMinutes: 0,
      maxBookingDaysAhead: 60,
      bufferMinutes,
      allowSameDayBooking: true,
      requireEmail,
      autoConfirmAppointments: false,
      maxAppointmentsPerPhonePerDay: 20,
    },
  });

  const category = await ServiceCategory.create({
    name: 'Preventive Care',
    slug: 'preventive-care',
  });

  const service = await Service.create({
    name: 'Professional Cleaning',
    slug: 'professional-cleaning',
    category: category._id,
    priceType: 'fixed',
    priceFrom: 20000,
    durationMinutes,
  });

  const dentistPayload = {
    title: 'DDS',
    services: [service._id],
    weeklySchedule: fullWeek('isWorking', dentistShifts),
    bookingEnabled: true,
    isActive: true,
  };

  const [dentist, secondDentist] = await Dentist.create([
    {
      ...dentistPayload,
      firstName: 'Ani',
      lastName: 'Hakobyan',
      slug: 'ani-hakobyan',
    },
    {
      ...dentistPayload,
      firstName: 'Aram',
      lastName: 'Sargsyan',
      slug: 'aram-sargsyan',
    },
  ]);

  return {
    clinic,
    category,
    service,
    dentist,
    secondDentist,
    date: futureDate(),
  };
};

export const seedStaff = async () => {
  const [admin, receptionist, dentistUser] = await User.create([
    {
      name: 'Admin User',
      email: 'admin@example.com',
      password: 'correct horse battery staple',
      role: 'admin',
    },
    {
      name: 'Reception User',
      email: 'reception@example.com',
      password: 'correct horse battery staple',
      role: 'receptionist',
    },
    {
      name: 'Dentist User',
      email: 'dentist@example.com',
      password: 'correct horse battery staple',
      role: 'dentist',
    },
  ]);

  return {
    admin,
    receptionist,
    dentistUser,
    adminToken: generateToken(admin),
    receptionistToken: generateToken(receptionist),
    dentistToken: generateToken(dentistUser),
  };
};

export const publicBooking = (core, startTime, suffix = '01') => ({
  patientName: 'Test Patient',
  patientPhone: `+37499123${String(suffix).padStart(3, '0')}`,
  patientEmail: 'patient@example.com',
  dentistId: String(core.dentist._id),
  serviceId: String(core.service._id),
  date: core.date,
  startTime,
  patientComment: '',
  privacyAccepted: true,
});
