import { rateLimit } from 'express-rate-limit';


const createHandler = (
  message
) => {
  return (req, res) => {
    res.status(429).json({
      success: false,
      message,
    });
  };
};


const apiLimiter =
  rateLimit({
    windowMs:
      15 * 60 * 1000,

    limit: 300,

    standardHeaders:
      'draft-8',

    legacyHeaders: false,

    handler:
      createHandler(
        'Too many requests. Please try again later.'
      ),
  });


const authLimiter =
  rateLimit({
    windowMs:
      15 * 60 * 1000,

    limit: 8,

    standardHeaders:
      'draft-8',

    legacyHeaders: false,

    skipSuccessfulRequests:
      true,

    handler:
      createHandler(
        'Too many login attempts. Please try again later.'
      ),
  });


const refreshLimiter =
  rateLimit({
    windowMs:
      5 * 60 * 1000,

    limit: 30,

    standardHeaders:
      'draft-8',

    legacyHeaders: false,

    handler:
      createHandler(
        'Too many requests. Please try again later.'
      ),
  });


const bookingLimiter =
  rateLimit({
    windowMs:
      15 * 60 * 1000,

    limit: 10,

    standardHeaders:
      'draft-8',

    legacyHeaders: false,

    handler:
      createHandler(
        'Too many booking attempts. Please try again later.'
      ),
  });



const mediaUploadLimiter =
  rateLimit({
    windowMs:
      15 * 60 * 1000,

    limit: 30,

    standardHeaders:
      'draft-8',

    legacyHeaders: false,

    handler:
      createHandler(
        'Too many media uploads. Please try again later.'
      ),
  });


export {
  apiLimiter,
  authLimiter,
  refreshLimiter,
  bookingLimiter,
  mediaUploadLimiter,
};

