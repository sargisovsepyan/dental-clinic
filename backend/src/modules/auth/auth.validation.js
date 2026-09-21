import Joi from 'joi';

import { isEmail } from '../../../../shared/booking-input.mjs';

import {
  loginPasswordJoi,
  newPasswordJoi,
} from '../../security/passwordPolicy.js';

const loginSchema = {
  body: Joi.object({
    email: Joi.string()
      .custom((value, helpers) => isEmail(helpers.original, true) ? value : helpers.error('any.invalid'))
      .trim()
      .lowercase()
      .email()
      .max(254)
      .required(),

    password: loginPasswordJoi
      .required(),
  }).required(),
};

const token = Joi.string()
  .min(40)
  .max(200)
  .required();

const changePasswordSchema = {
  body: Joi.object({
    currentPassword:
      loginPasswordJoi.required(),
    newPassword:
      newPasswordJoi.required(),
  }).required(),
};

const forgotPasswordSchema = {
  body: Joi.object({
    email: Joi.string()
      .custom((value, helpers) => isEmail(helpers.original, true) ? value : helpers.error('any.invalid'))
      .trim()
      .lowercase()
      .email()
      .max(254)
      .required(),
  }).required(),
};

const resetPasswordSchema = {
  body: Joi.object({
    token,
    password:
      newPasswordJoi.required(),
  }).required(),
};

const setupPasswordSchema =
  resetPasswordSchema;

export {
  loginSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  setupPasswordSchema,
};

