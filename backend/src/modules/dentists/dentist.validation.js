import Joi from 'joi';

import {
  createJoiTranslations,
} from '../../i18n/localization.js';
import { SLUG_PATTERN } from '../../utils/buildSlug.js';

const mongoId = Joi.string()
  .hex()
  .length(24);

const dentistTranslation = Joi.object({
  title: Joi.string()
    .trim()
    .min(2)
    .max(150),
  bio: Joi.string()
    .trim()
    .max(5000)
    .allow(''),
  specializations: Joi.array()
    .items(
      Joi.string()
        .trim()
        .min(2)
        .max(100)
    )
    .max(20)
    .unique(),
}).min(1);

const translations = createJoiTranslations(
  dentistTranslation
);

const time = Joi.string()
  .pattern(/^([01]\d|2[0-3]):[0-5]\d$/);

const shiftSchema = Joi.object({
  start: time.required(),
  end: time.required(),
});

const weeklyDaySchema = Joi.object({
  dayOfWeek: Joi.number()
    .integer()
    .min(1)
    .max(7)
    .required(),

  isWorking: Joi.boolean()
    .default(true),

  shifts: Joi.array()
    .items(shiftSchema)
    .max(6)
    .default([]),
});


const createDentistSchema = {
  body: Joi.object({
    firstName: Joi.string()
      .trim()
      .min(2)
      .max(80)
      .required(),

    lastName: Joi.string()
      .trim()
      .min(2)
      .max(80)
      .required(),

    slug: Joi.string()
      .trim()
      .lowercase()
      .pattern(SLUG_PATTERN)
      .min(2)
      .max(180),

    photoUrl: Joi.forbidden(),

    title: Joi.string()
      .trim()
      .max(150)
      .allow(''),

    translations,

    specializations: Joi.array()
      .items(
        Joi.string()
          .trim()
          .min(2)
          .max(100)
      )
      .max(20)
      .unique()
      .optional(),

    bio: Joi.string()
      .trim()
      .max(5000)
      .allow(''),

    experienceYears: Joi.number()
      .integer()
      .min(0)
      .max(70)
      .default(0),

    languages: Joi.array()
      .items(
        Joi.string().valid(
          'hy',
          'ru',
          'en',
          'fr',
          'de',
          'other'
        )
      )
      .unique()
      .default([]),

    services: Joi.array()
      .items(mongoId)
      .unique()
      .max(100)
      .default([]),

    weeklySchedule: Joi.array()
      .items(weeklyDaySchema)
      .max(7)
      .default([]),

    isFeatured: Joi.boolean()
      .default(false),

    bookingEnabled: Joi.boolean()
      .default(true),

    isActive: Joi.boolean()
      .default(true),

    sortOrder: Joi.number()
      .integer()
      .min(0)
      .max(10000)
      .default(0),
  }),
};


const updateDentistSchema = {
  params: Joi.object({
    id: mongoId.required(),
  }),

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

    firstName: Joi.string()
      .trim()
      .min(2)
      .max(80),

    lastName: Joi.string()
      .trim()
      .min(2)
      .max(80),

    title: Joi.string()
      .trim()
      .max(150)
      .allow(''),

    translations,

    slug: Joi.forbidden(),

    photoUrl: Joi.forbidden(),

    isActive: Joi.forbidden(),

    specializations: Joi.array()
      .items(
        Joi.string()
          .trim()
          .min(2)
          .max(100)
      )
      .max(20)
      .unique(),

    bio: Joi.string()
      .trim()
      .max(5000)
      .allow(''),

    experienceYears: Joi.number()
      .integer()
      .min(0)
      .max(70),

    languages: Joi.array()
      .items(
        Joi.string().valid(
          'hy',
          'ru',
          'en',
          'fr',
          'de',
          'other'
        )
      )
      .unique(),

    services: Joi.array()
      .items(mongoId)
      .unique()
      .max(100),

    weeklySchedule: Joi.array()
      .items(weeklyDaySchema)
      .max(7),

    isFeatured: Joi.boolean(),

    bookingEnabled: Joi.boolean(),

    sortOrder: Joi.number()
      .integer()
      .min(0)
      .max(10000),
  })
    .min(1),
};


const dentistIdSchema = {
  params: Joi.object({
    id: mongoId.required(),
  }),
};


const listDentistsSchema = {
  query: Joi.object({
    service: mongoId,

    featured: Joi.boolean(),

    bookingEnabled: Joi.boolean(),
  }),
};


const scheduleExceptionSchema = {
  params: Joi.object({
    id: mongoId.required(),

    date: Joi.string()
      .pattern(/^\d{4}-\d{2}-\d{2}$/)
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

    isWorking: Joi.boolean()
      .required(),

    shifts: Joi.array()
      .items(shiftSchema)
      .max(6)
      .default([]),

    note: Joi.string()
      .trim()
      .max(300)
      .allow('')
      .default(''),
  }),
};


const deleteScheduleExceptionSchema = {
  params: Joi.object({
    id: mongoId.required(),

    date: Joi.string()
      .pattern(/^\d{4}-\d{2}-\d{2}$/)
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


const listScheduleExceptionsSchema = {
  params: Joi.object({
    id: mongoId.required(),
  }),

  query: Joi.object({
    from: Joi.string()
      .pattern(/^\d{4}-\d{2}-\d{2}$/),

    to: Joi.string()
      .pattern(/^\d{4}-\d{2}-\d{2}$/),
  }).custom((value, helpers) => (
    value.from && value.to && value.from > value.to
      ? helpers.message({ custom: 'from must be on or before to' })
      : value
  )),
};


export {
  createDentistSchema,
  updateDentistSchema,
  dentistIdSchema,
  listDentistsSchema,
  scheduleExceptionSchema,
  deleteScheduleExceptionSchema,
  listScheduleExceptionsSchema,
};
