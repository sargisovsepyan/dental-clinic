import Joi from 'joi';

import {
  createJoiTranslations,
} from '../../i18n/localization.js';
import { SLUG_PATTERN } from '../../utils/buildSlug.js';

const mongoId = Joi.string()
  .hex()
  .length(24);

const serviceTranslation = Joi.object({
  name: Joi.string()
    .trim()
    .min(2)
    .max(150),
  shortDescription: Joi.string()
    .trim()
    .max(300)
    .allow(''),
  description: Joi.string()
    .trim()
    .max(5000)
    .allow(''),
}).min(1);

const serviceBody = {
  name: Joi.string()
    .trim()
    .min(2)
    .max(150),

  translations: createJoiTranslations(
    serviceTranslation
  ),

  category: mongoId,

  shortDescription: Joi.string()
    .trim()
    .max(300)
    .allow(''),

  description: Joi.string()
    .trim()
    .max(5000)
    .allow(''),

  priceType: Joi.string()
    .valid(
      'fixed',
      'from',
      'range',
      'on_request'
    ),

  priceFrom: Joi.number()
    .min(0)
    .allow(null),

  priceTo: Joi.number()
    .min(0)
    .allow(null),

  currency: Joi.string()
    .valid('AMD'),

  durationMinutes: Joi.number()
    .integer()
    .min(15)
    .max(480),

  isFeatured: Joi.boolean(),

  bookingEnabled: Joi.boolean(),

  sortOrder: Joi.number()
    .integer()
    .min(0)
    .max(10000),
};

const createServiceSchema = {
  body: Joi.object({
    ...serviceBody,

    imageUrl: Joi.forbidden(),

    slug: Joi.string()
      .trim()
      .lowercase()
      .pattern(SLUG_PATTERN)
      .min(2)
      .max(180),

    isActive: Joi.boolean()
      .default(true),

    category:
      serviceBody.category.required(),

    priceType:
      serviceBody.priceType.default(
        'on_request'
      ),

    durationMinutes:
      serviceBody.durationMinutes.default(
        60
      ),
  }).or('name', 'translations'),
};

const updateServiceSchema = {
  params: Joi.object({
    id: mongoId.required(),
  }),

  body: Joi.object({
    ...serviceBody,
    slug: Joi.forbidden(),
    imageUrl: Joi.forbidden(),
    isActive: Joi.forbidden(),
  })
    .min(1),
};

const serviceIdSchema = {
  params: Joi.object({
    id: mongoId.required(),
  }),
};

const listServiceSchema = {
  query: Joi.object({
    category: Joi.string()
      .trim()
      .max(120),

    featured: Joi.boolean(),

    bookingEnabled: Joi.boolean(),
  }),
};

export {
  createServiceSchema,
  updateServiceSchema,
  serviceIdSchema,
  listServiceSchema,
};
