import Joi from 'joi';


const mongoId =
  Joi.string()
    .hex()
    .length(24);


const entityIdSchema = {
  params:
    Joi.object({
      id:
        mongoId.required(),
    }),
};


const createGallerySchema = {
  body:
    Joi.object({
      altText:
        Joi.string()
          .trim()
          .max(200)
          .allow('')
          .default(''),

      caption:
        Joi.string()
          .trim()
          .max(500)
          .allow('')
          .default(''),

      sortOrder:
        Joi.number()
          .integer()
          .min(0)
          .max(10000)
          .default(0),
    }),
};


const updateGallerySchema = {
  params:
    Joi.object({
      id:
        mongoId.required(),
    }),

  body:
    Joi.object({
      altText:
        Joi.string()
          .trim()
          .max(200)
          .allow(''),

      caption:
        Joi.string()
          .trim()
          .max(500)
          .allow(''),

      sortOrder:
        Joi.number()
          .integer()
          .min(0)
          .max(10000),

      isActive:
        Joi.boolean(),
    })
      .min(1),
};


export {
  entityIdSchema,
  createGallerySchema,
  updateGallerySchema,
};
