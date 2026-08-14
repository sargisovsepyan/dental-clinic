import env from '../config/env.js';
import ApiError from '../utils/ApiError.js';


const enforceHttps = (req, _res, next) => {
  if (
    env.NODE_ENV === 'production' &&
    env.REQUIRE_HTTPS &&
    !req.secure
  ) {
    return next(new ApiError(426, 'HTTPS is required'));
  }
  return next();
};


const isCredentialOriginAllowed = (
  origin,
  production = env.NODE_ENV === 'production',
  allowedOrigins = env.CORS_ORIGINS
) => {
  if (!origin) {
    return !production;
  }
  return allowedOrigins.includes(origin);
};


const requireTrustedOrigin = (req, _res, next) => {
  const origin = req.get('origin');

  if (!isCredentialOriginAllowed(origin)) {
    return next(new ApiError(403, 'Request origin is not allowed'));
  }
  return next();
};


export {
  enforceHttps,
  requireTrustedOrigin,
  isCredentialOriginAllowed,
};
