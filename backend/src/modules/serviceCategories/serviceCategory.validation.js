import Joi from 'joi';

const mongoId = Joi.string()
  .hex()
  .length(24);

const createCategorySchema = {
  body: Joi.object({
    name: Joi.string()
      .trim()
      .min(2)
      .max(100)
      .required(),

    slug: Joi.string()
      .trim()
      .lowercase()
      .max(120)
      .optional(),

    description: Joi.string()
      .trim()
      .max(500)
      .allow('')
      .default(''),

    imageUrl: Joi.string()
      .uri()
      .allow('')
      .default(''),

    sortOrder: Joi.number()
      .integer()
      .min(0)
      .max(10000)
      .default(0),
  }),
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

    slug: Joi.string()
      .trim()
      .lowercase()
      .max(120),

    description: Joi.string()
      .trim()
      .max(500)
      .allow(''),

    imageUrl: Joi.string()
      .uri()
      .allow(''),

    sortOrder: Joi.number()
      .integer()
      .min(0)
      .max(10000),

    isActive: Joi.boolean(),
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
