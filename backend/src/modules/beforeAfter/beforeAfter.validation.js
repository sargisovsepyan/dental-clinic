import Joi from 'joi';


const mongoId =
  Joi.string()
    .hex()
    .length(24);


const createCaseSchema = {
  body:
    Joi.object({
      title:
        Joi.string()
          .trim()
          .min(2)
          .max(200)
          .required(),

      description:
        Joi.string()
          .trim()
          .max(2000)
          .allow('')
          .default(''),

      serviceId:
        mongoId
          .allow('')
          .default(''),

      dentistId:
        mongoId
          .allow('')
          .default(''),

      isFeatured:
        Joi.boolean()
          .default(false),

      sortOrder:
        Joi.number()
          .integer()
          .min(0)
          .max(10000)
          .default(0),

      consentConfirmed:
        Joi.boolean()
          .valid(true)
          .required(),
    }),
};


const updateCaseSchema = {
  params:
    Joi.object({
      id:
        mongoId.required(),
    }),

  body:
    Joi.object({
      title:
        Joi.string()
          .trim()
          .min(2)
          .max(200),

      description:
        Joi.string()
          .trim()
          .max(2000)
          .allow(''),

      serviceId:
        mongoId
          .allow(''),

      dentistId:
        mongoId
          .allow(''),

      isFeatured:
        Joi.boolean(),

      sortOrder:
        Joi.number()
          .integer()
          .min(0)
          .max(10000),
    })
      .min(1),
};


const caseIdSchema = {
  params:
    Joi.object({
      id:
        mongoId.required(),
    }),
};


const listCasesSchema = {
  query:
    Joi.object({
      serviceId:
        mongoId,

      dentistId:
        mongoId,

      featured:
        Joi.boolean(),

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
          .default(24),
    }),
};


export {
  createCaseSchema,
  updateCaseSchema,
  caseIdSchema,
  listCasesSchema,
};
