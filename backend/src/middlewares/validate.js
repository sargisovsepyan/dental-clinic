import ApiError from '../utils/ApiError.js';

import {
  assertSupportedTranslationKeys,
} from '../i18n/localization.js';
import env from '../config/env.js';

const validate = (schema) => {
  return (req, res, next) => {
    const targets = ['body', 'params', 'query'];

    for (const target of targets) {
      if (!schema[target]) {
        continue;
      }

      try {
        assertSupportedTranslationKeys(
          req[target]?.translations
        );
      }
      catch (error) {
        return next(error);
      }

      const { error, value } = schema[target].validate(
        req[target],
        {
          abortEarly: false,
          stripUnknown: true,
          context: {
            challengeRequired:
              env.PUBLIC_BOOKING_CHALLENGE_PROVIDER !== 'disabled',
          },
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
