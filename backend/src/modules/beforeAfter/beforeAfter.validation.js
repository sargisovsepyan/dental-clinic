import Joi from 'joi';


import {
  createJoiTranslations,
  createMultipartTranslations,
} from '../../i18n/localization.js';

const caseTranslation = Joi.object({
  title: Joi.string()
    .trim()
    .min(2)
    .max(200),
  description: Joi.string()
    .trim()
    .max(2000)
    .allow(''),
}).min(1);

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
          .max(200),

      translations:
        createMultipartTranslations(
          caseTranslation
        ),

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

      isActive:
        Joi.boolean()
          .default(true),

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

      translations:
        createJoiTranslations(
          caseTranslation
        ),

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
