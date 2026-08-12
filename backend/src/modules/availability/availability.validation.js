import Joi from 'joi';

const mongoId = Joi.string()
  .hex()
  .length(24);


const availabilitySchema = {
  query: Joi.object({
    dentistId:
      mongoId.required(),

    serviceId:
      mongoId.required(),

    date:
      Joi.string()
        .pattern(
          /^\d{4}-\d{2}-\d{2}$/
        )
        .required(),
  }),
};


export {
  availabilitySchema,
};
