import Joi from 'joi';


const mongoId = Joi.string()
  .hex()
  .length(24);

const auditInstant = Joi.date().iso().custom((value, helpers) => {
  const original = helpers.original;
  if (typeof original !== 'string' || !/T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/iu.test(original)) {
    return helpers.error('date.instant');
  }
  return value;
}).messages({ 'date.instant': 'Audit date filters require an ISO instant with an explicit timezone' });


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
      auditInstant,

    to:
      auditInstant,

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
