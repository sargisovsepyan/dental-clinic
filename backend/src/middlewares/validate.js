import ApiError from '../utils/ApiError.js';

const validate = (schema) => {
  return (req, res, next) => {
    const targets = ['body', 'params', 'query'];

    for (const target of targets) {
      if (!schema[target]) {
        continue;
      }

      const { error, value } = schema[target].validate(
        req[target],
        {
          abortEarly: false,
          stripUnknown: true,
        }
      );

      if (error) {
        const message = error.details
          .map((detail) => detail.message)
          .join(', ');

        return next(
          new ApiError(400, message)
        );
      }

      if (target === 'query') {
        req.validatedQuery = value;
      } else {
        req[target] = value;
      }
    }

    next();
  };
};

export default validate;
