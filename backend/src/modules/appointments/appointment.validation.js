import Joi from 'joi';


const mongoId = Joi.string()
  .hex()
  .length(24);


const createAppointmentSchema = {
  body: Joi.object({
    patientName:
      Joi.string()
        .trim()
        .min(2)
        .max(120)
        .required(),

    patientPhone:
      Joi.string()
        .trim()
        .min(8)
        .max(30)
        .required(),

    patientEmail:
      Joi.string()
        .trim()
        .lowercase()
        .email()
        .max(254)
        .allow('')
        .default(''),

    dentistId:
      mongoId.required(),

    serviceId:
      mongoId.required(),

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

    patientComment:
      Joi.string()
        .trim()
        .max(1000)
        .allow('')
        .default(''),

    privacyAccepted:
      Joi.boolean()
        .valid(true)
        .required(),
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
    reason:
      Joi.string()
        .trim()
        .min(2)
        .max(500)
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
  }),
};


export {
  createAppointmentSchema,
  appointmentIdSchema,
  updateStatusSchema,
  cancelAppointmentSchema,
  listAppointmentsSchema,
};
