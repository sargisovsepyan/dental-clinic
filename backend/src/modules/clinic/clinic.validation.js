import Joi from 'joi';

import {
  createJoiTranslations,
} from '../../i18n/localization.js';
import {
  safeHttpsUrl,
  safeSocialUrl,
} from '../../utils/publicUrl.js';

const clinicTranslation = Joi.object({
  clinicName: Joi.string()
    .trim()
    .min(2)
    .max(150),
  tagline: Joi.string()
    .trim()
    .max(250)
    .allow(''),
  description: Joi.string()
    .trim()
    .max(5000)
    .allow(''),
  address: Joi.string()
    .trim()
    .max(300)
    .allow(''),
}).min(1);

const time = Joi.string()
  .pattern(/^([01]\d|2[0-3]):[0-5]\d$/);


const shiftSchema = Joi.object({
  start: time.required(),
  end: time.required(),
});


const workingDaySchema = Joi.object({
  dayOfWeek: Joi.number()
    .integer()
    .min(1)
    .max(7)
    .required(),

  isOpen: Joi.boolean()
    .required(),

  shifts: Joi.array()
    .items(shiftSchema)
    .max(6)
    .default([]),
});


const bookingSettingsSchema =
  Joi.object({
    isBookingEnabled:
      Joi.boolean(),

    slotIntervalMinutes:
      Joi.number()
        .integer()
        .valid(
          10,
          15,
          20,
          30,
          60
        ),

    minBookingNoticeMinutes:
      Joi.number()
        .integer()
        .min(0)
        .max(10080),

    maxBookingDaysAhead:
      Joi.number()
        .integer()
        .min(1)
        .max(365),

    bufferMinutes:
      Joi.number()
        .integer()
        .min(0)
        .max(120),

    allowSameDayBooking:
      Joi.boolean(),

    requireEmail:
      Joi.boolean(),

    autoConfirmAppointments:
      Joi.boolean(),

    cancellationNoticeHours:
      Joi.forbidden(),

    maxAppointmentsPerPhonePerDay:
      Joi.number()
        .integer()
        .min(1)
        .max(20),
  });


const socialLinksSchema =
  Joi.object({
    instagram:
      safeSocialUrl('instagram')
        .allow(''),

    facebook:
      safeSocialUrl('facebook')
        .allow(''),

    whatsapp:
      safeSocialUrl('whatsapp')
        .allow(''),

    telegram:
      safeSocialUrl('telegram')
        .allow(''),
  });


const updateClinicSchema = {
  body: Joi.object({
    expectedScheduleRevision: Joi.number()
      .integer()
      .min(0)
      .when('weeklySchedule', {
        is: Joi.exist(),
        then: Joi.required(),
      }),

    scheduleConflictAcknowledgement: Joi.string()
      .hex()
      .length(64),

    clinicName:
      Joi.string()
        .trim()
        .min(2)
        .max(150),

    translations:
      createJoiTranslations(
        clinicTranslation
      ),

    tagline:
      Joi.string()
        .trim()
        .max(250)
        .allow(''),

    description:
      Joi.string()
        .trim()
        .max(5000)
        .allow(''),

    phone:
      Joi.string()
        .trim()
        .max(30)
        .allow(''),

    secondaryPhone:
      Joi.string()
        .trim()
        .max(30)
        .allow(''),

    email:
      Joi.string()
        .trim()
        .lowercase()
        .email()
        .max(254)
        .allow(''),

    address:
      Joi.string()
        .trim()
        .max(300)
        .allow(''),

    mapUrl:
      safeHttpsUrl
        .allow(''),

    latitude:
      Joi.number()
        .min(-90)
        .max(90)
        .allow(null),

    longitude:
      Joi.number()
        .min(-180)
        .max(180)
        .allow(null),

    socialLinks:
      socialLinksSchema,

    weeklySchedule:
      Joi.array()
        .items(
          workingDaySchema
        )
        .max(7),

    bookingSettings:
      bookingSettingsSchema,
  })
    .min(1),
};


const closureSchema = {
  params: Joi.object({
    date: Joi.string()
      .pattern(
        /^\d{4}-\d{2}-\d{2}$/
      )
      .required(),
  }),

  body: Joi.object({
    expectedScheduleRevision: Joi.number()
      .integer()
      .min(0)
      .required(),

    scheduleConflictAcknowledgement: Joi.string()
      .hex()
      .length(64),

    isOpen:
      Joi.boolean()
        .required(),

    shifts:
      Joi.array()
        .items(shiftSchema)
        .max(6)
        .default([]),

    note:
      Joi.string()
        .trim()
        .max(300)
        .allow('')
        .default(''),
  }),
};


const closureDateSchema = {
  params: Joi.object({
    date: Joi.string()
      .pattern(
        /^\d{4}-\d{2}-\d{2}$/
      )
      .required(),
  }),

  query: Joi.object({
    expectedScheduleRevision: Joi.number()
      .integer()
      .min(0)
      .required(),

    scheduleConflictAcknowledgement: Joi.string()
      .hex()
      .length(64),
  }),
};


const listClosuresSchema = {
  query: Joi.object({
    from: Joi.string()
      .pattern(
        /^\d{4}-\d{2}-\d{2}$/
      ),

    to: Joi.string()
      .pattern(
        /^\d{4}-\d{2}-\d{2}$/
      ),
  }).custom((value, helpers) => (
    value.from && value.to && value.from > value.to
      ? helpers.message({ custom: 'from must be on or before to' })
      : value
  )),
};


export {
  updateClinicSchema,
  closureSchema,
  closureDateSchema,
  listClosuresSchema,
};
