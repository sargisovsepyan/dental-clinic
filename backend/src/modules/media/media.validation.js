import Joi from 'joi';


import {
  createJoiTranslations,
  createMultipartTranslations,
} from '../../i18n/localization.js';

const galleryTranslation = Joi.object({
  altText: Joi.string()
    .trim()
    .min(1)
    .max(200),
  caption: Joi.string()
    .trim()
    .max(500)
    .allow(''),
}).min(1);

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

      translations:
        createMultipartTranslations(
          galleryTranslation
        ),

      sortOrder:
        Joi.number()
          .integer()
          .min(0)
          .max(10000)
          .default(0),

      isActive:
        Joi.boolean()
          .default(true),
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

      translations:
        createJoiTranslations(
          galleryTranslation
        ),

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
