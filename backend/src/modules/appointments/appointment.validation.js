import Joi from 'joi';


import { isHumanName, canonicalPhone, isEmail, isCalendarDate } from '../../../../shared/booking-input.mjs';

const mongoId = Joi.string()
  .hex()
  .length(24);

const expectedMutationVersion = Joi.number()
  .integer()
  .min(0)
  .required();


const patientFields = {
  patientName:
    Joi.string()
      .custom((value, helpers) => isHumanName(helpers.original) ? value : helpers.error('any.invalid'))
      .trim()
      .min(2)
      .max(120)
      .required(),

  patientPhone:
    Joi.string()
      .custom((value, helpers) => canonicalPhone(helpers.original) ? value : helpers.error('any.invalid'))
      .trim()
      .min(8)
      .max(30)
      .required(),

  patientEmail:
    Joi.string()
      .custom((value, helpers) => isEmail(helpers.original) ? value : helpers.error('any.invalid'))
      .trim()
      .lowercase()
      .email({ tlds: { allow: false } })
      .max(254)
      .allow('')
      .default(''),

  dentistId:
    mongoId.required(),

  serviceId:
    mongoId.required(),

  date:
    Joi.string()
      .custom((value, helpers) => isCalendarDate(value) ? value : helpers.error('any.invalid'))
      .pattern(
        /^\d{4}-\d{2}-\d{2}$/
      )
      .required(),

  startTime:
    Joi.string()
      .pattern(
        /^([01]\d|2[0-3]):[0-5]\d$/
      )
      .required(),

  patientComment:
    Joi.string()
      .trim()
      .max(1000)
      .allow('')
      .default(''),

  locale:
    Joi.string()
      .valid('hy', 'ru', 'en')
      .default('hy'),
};


const createAppointmentSchema = {
  body: Joi.object({
    ...patientFields,

    privacyAccepted:
      Joi.boolean()
        .valid(true)
        .required(),

    challengeToken:
      Joi.string()
        .min(10)
        .max(4096)
        .when('$challengeRequired', {
          is: true,
          then: Joi.required(),
          otherwise: Joi.optional(),
        }),
  }),
};


const createAdminAppointmentSchema = {
  body: Joi.object({
    ...patientFields,

    source:
      Joi.string()
        .valid(
          'phone',
          'admin'
        )
        .default('phone'),

    consentMethod:
      Joi.string()
        .valid(
          'phone',
          'in_person'
        )
        .required(),

    privacyAccepted:
      Joi.boolean()
        .valid(true)
        .required(),

    internalNote:
      Joi.string()
        .trim()
        .max(2000)
        .allow('')
        .default(''),
  }),
};


const appointmentIdSchema = {
  params: Joi.object({
    id:
      mongoId.required(),
  }),
};


const updateStatusSchema = {
  params: Joi.object({
    id:
      mongoId.required(),
  }),

  body: Joi.object({
    expectedMutationVersion,

    status:
      Joi.string()
        .valid(
          'confirmed',
          'checked_in',
          'in_progress',
          'completed',
          'no_show'
        )
        .required(),

    internalNote:
      Joi.string()
        .trim()
        .max(2000)
        .allow(''),
  }),
};


const cancelAppointmentSchema = {
  params: Joi.object({
    id:
      mongoId.required(),
  }),

  body: Joi.object({
    expectedMutationVersion,

    reason:
      Joi.string()
        .trim()
        .min(2)
        .max(500)
        .required(),
  }),
};


const rescheduleAppointmentSchema = {
  params: Joi.object({
    id:
      mongoId.required(),
  }),

  body: Joi.object({
    expectedMutationVersion,

    date:
      Joi.string()
        .pattern(
          /^\d{4}-\d{2}-\d{2}$/
        )
        .required(),

    startTime:
      Joi.string()
        .pattern(
          /^([01]\d|2[0-3]):[0-5]\d$/
        )
        .required(),

    dentistId:
      mongoId,

    serviceId:
      mongoId,

    reason:
      Joi.string()
        .trim()
        .max(500)
        .allow('')
        .default(''),
  }),
};

const rescheduleAvailabilitySchema = {
  params: appointmentIdSchema.params,
  query: Joi.object({
    expectedMutationVersion,
    dentistId: mongoId.required(),
    serviceId: mongoId.required(),
    date: Joi.string()
      .pattern(/^\d{4}-\d{2}-\d{2}$/)
      .required(),
  }),
};


const listAppointmentsSchema = {
  query: Joi.object({
    date:
      Joi.string()
        .pattern(
          /^\d{4}-\d{2}-\d{2}$/
        ),

    from:
      Joi.string()
        .pattern(
          /^\d{4}-\d{2}-\d{2}$/
        ),

    to:
      Joi.string()
        .pattern(
          /^\d{4}-\d{2}-\d{2}$/
        ),

    dentistId:
      mongoId,

    serviceId:
      mongoId,

    status:
      Joi.string()
        .valid(
          'pending',
          'confirmed',
          'checked_in',
          'in_progress',
          'completed',
          'cancelled',
          'no_show'
        ),

    phone:
      Joi.string()
        .custom((value, helpers) => canonicalPhone(helpers.original) ? value : helpers.error('any.invalid'))
        .trim()
        .max(30),

    page:
      Joi.number()
        .integer()
        .min(1)
        .default(1),

    limit:
      Joi.number()
        .integer()
        .min(1)
        .max(100)
        .default(25),
  }).custom((value, helpers) => (
    value.from && value.to && value.from > value.to
      ? helpers.message({ custom: 'from must be on or before to' })
      : value
  )),
};


const listMyAppointmentsSchema = {
  query: Joi.object({
    date: Joi.string().isoDate().pattern(/^\d{4}-\d{2}-\d{2}$/),
    from: Joi.string().isoDate().pattern(/^\d{4}-\d{2}-\d{2}$/),
    to: Joi.string().isoDate().pattern(/^\d{4}-\d{2}-\d{2}$/),
    page: Joi.number().integer().min(1).max(100000).default(1),
    limit: Joi.number().integer().min(1).max(50).default(25),
  }).custom((value, helpers) => {
    for (const field of ['date', 'from', 'to']) {
      if (value[field] && new Date(`${value[field]}T12:00:00Z`).toISOString().slice(0, 10) !== value[field]) return helpers.error('any.invalid');
    }
    if (value.date && (value.from || value.to)) return helpers.error('any.invalid');
    if (value.from && value.to && value.from > value.to) return helpers.error('any.invalid');
    return value;
  }).prefs({ stripUnknown: false }),
};

export {
  listMyAppointmentsSchema,
  createAppointmentSchema,
  createAdminAppointmentSchema,
  appointmentIdSchema,
  updateStatusSchema,
  cancelAppointmentSchema,
  rescheduleAppointmentSchema,
  listAppointmentsSchema,
  rescheduleAvailabilitySchema,
};
