import Joi from 'joi';

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
      .trim()
      .min(2)
      .max(100)
      .required(),
    email: Joi.string()
      .trim()
      .lowercase()
      .email()
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
  }),
};

export {
  inviteStaffSchema,
  staffIdSchema,
  updateRoleSchema,
  listStaffSchema,
};
