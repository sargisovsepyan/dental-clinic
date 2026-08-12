import Joi from 'joi';

const loginSchema = {
  body: Joi.object({
    email: Joi.string()
      .trim()
      .lowercase()
      .email()
      .max(254)
      .required(),

    password: Joi.string()
      .min(6)
      .max(128)
      .required(),
  }).required(),
};

export {
  loginSchema,
};

