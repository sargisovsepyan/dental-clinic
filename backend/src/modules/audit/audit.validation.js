import Joi from 'joi';


const mongoId = Joi.string()
  .hex()
  .length(24);


const listAuditLogsSchema = {
  query: Joi.object({
    action:
      Joi.string()
        .trim()
        .max(120),

    entityType:
      Joi.string()
        .trim()
        .max(80),

    entityId:
      Joi.string()
        .trim()
        .max(150),

    actorId:
      mongoId,

    from:
      Joi.date()
        .iso(),

    to:
      Joi.date()
        .iso(),

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
        .default(50),
  }).custom(
    (value, helpers) => {
      if (
        value.from &&
        value.to &&
        value.from > value.to
      ) {
        return helpers.error(
          'date.range'
        );
      }

      return value;
    }
  ).messages({
    'date.range':
      '"from" must be earlier than or equal to "to"',
  }),
};


export {
  listAuditLogsSchema,
};
