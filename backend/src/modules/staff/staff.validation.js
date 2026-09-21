import Joi from 'joi';

import { isHumanName, isEmail } from '../../../../shared/booking-input.mjs';

const mongoId = Joi.string()
  .hex()
  .length(24);

const role = Joi.string().valid(
  'admin',
  'receptionist',
  'dentist'
);

const inviteStaffSchema = {
  body: Joi.object({
    name: Joi.string()
      .custom((value, helpers) => isHumanName(helpers.original, 100) ? value : helpers.error('any.invalid'))
      .trim()
      .min(2)
      .max(100)
      .required(),
    email: Joi.string()
      .custom((value, helpers) => isEmail(helpers.original, true) ? value : helpers.error('any.invalid'))
      .trim()
      .lowercase()
      .email({ tlds: { allow: false } })
      .max(254)
      .required(),
    role: role.required(),
  }).required(),
};

const staffIdSchema = {
  params: Joi.object({ id: mongoId.required() }),
};

const updateRoleSchema = {
  params: staffIdSchema.params,
  body: Joi.object({
    role: role.required(),
  }).required(),
};

const listStaffSchema = {
  query: Joi.object({
    role,
    lifecycle: Joi.string().valid('current', 'active', 'pending', 'deactivated', 'all'),
    isActive: Joi.boolean(),
    setupComplete: Joi.boolean(),
    page: Joi.number()
      .integer()
      .min(1)
      .default(1),
    limit: Joi.number()
      .integer()
      .min(1)
      .max(100)
      .default(50),
  }).oxor('lifecycle', 'isActive').oxor('lifecycle', 'setupComplete'),
};

export {
  dentistProfileSchema,
  inviteStaffSchema,
  staffIdSchema,
  updateRoleSchema,
  listStaffSchema,
};

export const resendInvitationSchema = {
  params: staffIdSchema.params,
  body: Joi.object({}).default({}).prefs({ stripUnknown: false }),
};

const dentistProfileSchema = {
  params: staffIdSchema.params,
  body: Joi.object({ dentistId: mongoId.allow(null).required() }).required().prefs({ stripUnknown: false }),
};
