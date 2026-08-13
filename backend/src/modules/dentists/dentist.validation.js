import Joi from 'joi';

import {
  createJoiTranslations,
} from '../../i18n/localization.js';

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
      .max(180),

    title: Joi.string()
      .trim()
      .max(150)
      .allow('')
      .default(''),

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
      .default([]),

    bio: Joi.string()
      .trim()
      .max(5000)
      .allow('')
      .default(''),

    experienceYears: Joi.number()
      .integer()
      .min(0)
      .max(70)
      .default(0),

    photoUrl: Joi.string()
      .uri()
      .allow('')
      .default(''),

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
    firstName: Joi.string()
      .trim()
      .min(2)
      .max(80),

    lastName: Joi.string()
      .trim()
      .min(2)
      .max(80),

    slug: Joi.string()
      .trim()
      .lowercase()
      .max(180),

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
      .unique(),

    bio: Joi.string()
      .trim()
      .max(5000)
      .allow(''),

    experienceYears: Joi.number()
      .integer()
      .min(0)
      .max(70),

    photoUrl: Joi.string()
      .uri()
      .allow(''),

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

    isActive: Joi.boolean(),

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
  }),
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
