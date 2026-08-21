import crypto from 'crypto';

import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';

import env from '../config/env.js';
import { sendRedisCommand } from '../infrastructure/redis.js';
import logger from '../observability/logger.js';
import normalizePhone from '../utils/normalizePhone.js';
import {
  getRefreshTokenFamilyId,
} from '../utils/refreshToken.js';


const hmac = (value) => crypto
  .createHmac('sha256', env.RATE_LIMIT_KEY_SECRET)
  .update(String(value))
  .digest('hex');


const requestIpKey = (req) => ipKeyGenerator(req.ip || 'unknown');


const accountKey = (req) => {
  const email = typeof req.body?.email === 'string'
    ? req.body.email.trim().normalize('NFKC').toLowerCase()
    : '';
  return email
    ? hmac(email)
    : requestIpKey(req);
};


const tokenKey = (req) => {
  const token = req.body?.token || req.cookies?.refresh_token || '';
  const refreshFamilyId = getRefreshTokenFamilyId(token);
  return token
    ? hmac(refreshFamilyId || token)
    : requestIpKey(req);
};


const bookingKey = (req) => {
  if (typeof req.body?.patientPhone !== 'string') {
    return requestIpKey(req);
  }

  try {
    return hmac(normalizePhone(req.body.patientPhone));
  }
  catch {
    return requestIpKey(req);
  }
};


const createRedisRateLimitStore = (
  name,
  commandSender = sendRedisCommand
) => new RedisStore({
    prefix: `dental-clinic:rate-limit:${name}:`,
    sendCommand: (...args) => commandSender(args),
  });


const createStore = (name) => {
  if (env.RATE_LIMIT_STORE !== 'redis') {
    return undefined;
  }
  return createRedisRateLimitStore(name);
};


const createHandler = (message) => (_req, res) => {
  res.status(429).json({
    success: false,
    message,
  });
};


const createLimiter = (name, options) => rateLimit({
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  passOnStoreError: false,
  logger: {
    error: (error, message) => logger.error('rate_limit_error', {
      limiter: name,
      message,
      error,
    }),
    warn: (error, message) => logger.warn('rate_limit_warning', {
      limiter: name,
      message,
      error,
    }),
  },
  store: createStore(name),
  ...options,
});


const apiLimiter = createLimiter('api', {
  windowMs: 15 * 60 * 1000,
  limit: 300,
  handler: createHandler(
    'Too many requests. Please try again later.'
  ),
});


const authLimiter = createLimiter('login', {
  windowMs: 15 * 60 * 1000,
  limit: 8,
  keyGenerator: accountKey,
  skipSuccessfulRequests: true,
  handler: createHandler(
    'Too many login attempts. Please try again later.'
  ),
});


const authIpLimiter = createLimiter('login-ip', {
  windowMs: 15 * 60 * 1000,
  limit: 30,
  keyGenerator: requestIpKey,
  skipSuccessfulRequests: true,
  handler: createHandler(
    'Too many login attempts. Please try again later.'
  ),
});


const refreshLimiter = createLimiter('refresh', {
  windowMs: 5 * 60 * 1000,
  limit: 30,
  keyGenerator: tokenKey,
  handler: createHandler(
    'Too many requests. Please try again later.'
  ),
});


const bookingLimiter = createLimiter('booking', {
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: bookingKey,
  handler: createHandler(
    'Too many booking attempts. Please try again later.'
  ),
});


const passwordRecoveryLimiter = createLimiter('password-recovery', {
  windowMs: 15 * 60 * 1000,
  limit: 5,
  keyGenerator: accountKey,
  handler: createHandler(
    'Too many recovery attempts. Please try again later.'
  ),
});


const passwordSetupLimiter = createLimiter('password-setup', {
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: tokenKey,
  handler: createHandler(
    'Too many password setup attempts. Please try again later.'
  ),
});


const mediaUploadLimiter = createLimiter('media-upload', {
  windowMs: 15 * 60 * 1000,
  limit: 30,
  handler: createHandler(
    'Too many media uploads. Please try again later.'
  ),
});


const readinessLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: createHandler(
    'Too many readiness checks. Please try again later.'
  ),
});


export {
  apiLimiter,
  authLimiter,
  authIpLimiter,
  refreshLimiter,
  bookingLimiter,
  mediaUploadLimiter,
  readinessLimiter,
  passwordRecoveryLimiter,
  passwordSetupLimiter,
  createRedisRateLimitStore,
  bookingKey,
  tokenKey,
};
