import Joi from 'joi';

import {
  createJoiTranslations,
} from '../../i18n/localization.js';
import { SLUG_PATTERN } from '../../utils/buildSlug.js';

const mongoId = Joi.string()
  .hex()
  .length(24);

const categoryTranslation = Joi.object({
  name: Joi.string()
    .trim()
    .min(2)
    .max(100),
  description: Joi.string()
    .trim()
    .max(500)
    .allow(''),
}).min(1);

const translations = createJoiTranslations(
  categoryTranslation
);

const createCategorySchema = {
  body: Joi.object({
    name: Joi.string()
      .trim()
      .min(2)
      .max(100),

    translations,

    slug: Joi.string()
      .trim()
      .lowercase()
      .pattern(SLUG_PATTERN)
      .min(2)
      .max(120)
      .optional(),

    imageUrl: Joi.forbidden(),

    description: Joi.string()
      .trim()
      .max(500)
      .allow('')
      .optional(),

    sortOrder: Joi.number()
      .integer()
      .min(0)
      .max(10000)
      .default(0),

    isActive: Joi.boolean()
      .default(true),
  }).or('name', 'translations'),
};

const updateCategorySchema = {
  params: Joi.object({
    id: mongoId.required(),
  }),

  body: Joi.object({
    name: Joi.string()
      .trim()
      .min(2)
      .max(100),

    translations,

    slug: Joi.forbidden(),

    imageUrl: Joi.forbidden(),

    isActive: Joi.forbidden(),

    description: Joi.string()
      .trim()
      .max(500)
      .allow(''),

    sortOrder: Joi.number()
      .integer()
      .min(0)
      .max(10000),

  })
    .min(1),
};

const categoryIdSchema = {
  params: Joi.object({
    id: mongoId.required(),
  }),
};

export {
  createCategorySchema,
  updateCategorySchema,
  categoryIdSchema,
};
