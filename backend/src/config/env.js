import dotenv from 'dotenv';
import { isIP } from 'node:net';

import Joi from 'joi';


if (process.env.NODE_ENV !== 'test') {
  dotenv.config({ quiet: true });
}


const timeZone = Joi.string()
  .custom((value, helpers) => {
    try {
      new Intl.DateTimeFormat('en-US', {
        timeZone: value,
      }).format();
      return value;
    }
    catch {
      return helpers.error('any.invalid');
    }
  })
  .messages({
    'any.invalid':
      '{{#label}} must be a valid IANA time zone',
  });


const accessTokenLifetime = Joi.string()
  .pattern(/^[1-9][0-9]*(?:s|m|h)$/)
  .default('15m');


const policyVersion = Joi.string()
  .pattern(/^[0-9]{4}-[0-9]{2}(?:\.[0-9]+)?$/);


const envSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().integer().min(1).max(65535).default(5000),
  MONGO_URI: Joi.string().required(),

  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: accessTokenLifetime,
  REFRESH_TOKEN_TTL_DAYS: Joi.number()
    .integer().min(1).max(30).default(7),
  SESSION_ABSOLUTE_TTL_DAYS: Joi.number()
    .integer().min(1).max(90).default(30),
  APPOINTMENT_QUOTA_SECRET: Joi.string()
    .allow('').min(32).default(''),
  APPOINTMENT_QUOTA_KEY_VERSION: Joi.string()
    .pattern(/^v[1-9][0-9]{0,5}$/).default('v1'),
  RATE_LIMIT_KEY_SECRET: Joi.string()
    .allow('').min(32).default(''),
  AUDIT_PSEUDONYM_SECRET: Joi.string()
    .allow('').min(32).default(''),
  APPOINTMENT_PRIVACY_POLICY_VERSION:
    policyVersion.default('2026-01'),
  BOOKING_IDEMPOTENCY_TTL_HOURS: Joi.number()
    .integer().min(1).max(168).default(24),

  CLIENT_URL: Joi.string().required(),
  CORS_ORIGINS: Joi.string().required(),
  FRONTEND_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] }).required(),
  REQUIRE_HTTPS: Joi.boolean().required(),
  TRUST_PROXY_HOPS: Joi.number()
    .integer().min(0).max(10).required(),
  TRUST_PROXY_CIDRS: Joi.string().allow('').default(''),
  REFRESH_COOKIE_SECURE: Joi.boolean().required(),
  REFRESH_COOKIE_SAME_SITE: Joi.string()
    .valid('strict', 'lax', 'none').default('strict'),
  REFRESH_COOKIE_DOMAIN: Joi.string().allow('').default(''),

  API_REPLICA_COUNT: Joi.number()
    .integer().min(1).max(1000).default(1),
  RATE_LIMIT_STORE: Joi.string()
    .valid('memory', 'redis').required(),
  REDIS_URL: Joi.string().allow('').default(''),
  REDIS_CONNECT_TIMEOUT_MS: Joi.number()
    .integer().min(100).max(30000).default(5000),

  MEDIA_CLEANUP_MAX_ATTEMPTS: Joi.number()
    .integer().min(1).max(50).default(8),
  MEDIA_CLEANUP_BACKOFF_BASE_SECONDS: Joi.number()
    .integer().min(1).max(86400).default(60),
  MEDIA_CLEANUP_BACKOFF_MAX_SECONDS: Joi.number()
    .integer().min(60).max(604800).default(86400),
  MEDIA_CLEANUP_REFERENCE_RETRY_SECONDS: Joi.number()
    .integer().min(60).max(604800).default(3600),
  MEDIA_CLEANUP_STALE_LOCK_SECONDS: Joi.number()
    .integer().min(60).max(86400).default(900),

  INVITE_TOKEN_TTL_MINUTES: Joi.number()
    .integer().min(5).max(10080).default(1440),
  RESET_TOKEN_TTL_MINUTES: Joi.number()
    .integer().min(5).max(1440).default(30),

  BEFORE_AFTER_CONSENT_VERSION: Joi.string()
    .pattern(/^[0-9]{4}-[0-9]{2}(?:\.[0-9]+)?$/)
    .default('2026-01'),

  SMTP_HOST: Joi.string().allow('').default(''),
  SMTP_PORT: Joi.number().integer().min(1).max(65535).default(587),
  SMTP_SECURE: Joi.boolean().default(false),
  SMTP_REQUIRE_TLS: Joi.boolean().default(true),
  SMTP_USER: Joi.string().allow('').default(''),
  SMTP_PASSWORD: Joi.string().allow('').default(''),
  MAIL_FROM: Joi.string()
    .email({ tlds: { allow: false } })
    .max(254).allow('').default(''),
  SMTP_CONNECTION_TIMEOUT_MS: Joi.number()
    .integer().min(100).max(30000).default(5000),
  SMTP_SOCKET_TIMEOUT_MS: Joi.number()
    .integer().min(1000).max(120000).default(15000),

  NOTIFICATIONS_ENABLED: Joi.boolean().default(false),
  CLINIC_NOTIFICATION_EMAIL: Joi.string()
    .email({ tlds: { allow: false } })
    .max(254).allow('').default(''),
  NOTIFICATION_WORKER_POLL_INTERVAL_MS: Joi.number()
    .integer().min(100).max(60000).default(2000),
  NOTIFICATION_WORKER_LEASE_MS: Joi.number()
    .integer().min(10000).max(600000).default(120000),
  NOTIFICATION_WORKER_CONCURRENCY: Joi.number()
    .integer().min(1).max(20).default(4),
  NOTIFICATION_MAX_ATTEMPTS: Joi.number()
    .integer().min(1).max(50).default(8),
  NOTIFICATION_RETRY_BASE_SECONDS: Joi.number()
    .integer().min(1).max(86400).default(60),
  NOTIFICATION_RETRY_MAX_SECONDS: Joi.number()
    .integer().min(60).max(604800).default(21600),
  NOTIFICATION_RETENTION_DAYS: Joi.number()
    .integer().min(1).max(365).default(30),

  CLINIC_TIMEZONE: timeZone.default('Asia/Yerevan'),
  CLOUDINARY_CLOUD_NAME: Joi.string().allow('').default(''),
  CLOUDINARY_API_KEY: Joi.string().allow('').default(''),
  CLOUDINARY_API_SECRET: Joi.string().allow('').default(''),

  LOG_LEVEL: Joi.string()
    .valid('debug', 'info', 'warn', 'error').default('info'),
  ERROR_MONITOR_WEBHOOK_URL: Joi.string()
    .uri({ scheme: ['https'] }).allow('').default(''),
  HEALTH_CHECK_TIMEOUT_MS: Joi.number()
    .integer().min(100).max(10000).default(1500),
  READINESS_CACHE_MS: Joi.number()
    .integer().min(100).max(30000).default(3000),
  READINESS_FAILURE_CACHE_MS: Joi.number()
    .integer().min(100).max(10000).default(1000),
  GRACEFUL_SHUTDOWN_TIMEOUT_MS: Joi.number()
    .integer().min(1000).max(120000).default(15000),

  PUBLIC_BOOKING_CHALLENGE_PROVIDER: Joi.string()
    .valid('disabled', 'turnstile').default('disabled'),
  PUBLIC_BOOKING_CHALLENGE_SECRET: Joi.string()
    .min(20).allow('').default(''),
  PUBLIC_BOOKING_CHALLENGE_TIMEOUT_MS: Joi.number()
    .integer().min(100).max(10000).default(2000),
})
  .unknown(true);


const parseOrigin = (rawOrigin, fieldName) => {
  let parsed;
  try {
    parsed = new URL(rawOrigin);
  }
  catch {
    throw new Error(`${fieldName} contains an invalid URL origin`);
  }

  if (
    parsed.origin !== rawOrigin ||
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error(
      `${fieldName} entries must be exact HTTP(S) origins without paths`
    );
  }

  return parsed;
};


const validateMongoTransport = (uri) => {
  let parsed;
  try {
    parsed = new URL(uri);
  }
  catch {
    throw new Error('MONGO_URI must be a valid MongoDB URI');
  }

  if (!parsed.hostname || parsed.pathname.length <= 1) {
    throw new Error('Production MONGO_URI must include a host and database name');
  }

  if (parsed.protocol === 'mongodb+srv:') {
    return;
  }

  if (
    parsed.protocol !== 'mongodb:' ||
    !['true', '1'].includes(
      parsed.searchParams.get('tls') ||
      parsed.searchParams.get('ssl') ||
      ''
    )
  ) {
    throw new Error(
      'Production MONGO_URI must use mongodb+srv or explicitly enable TLS'
    );
  }
};


const validateRedisUrl = (url, production) => {
  let parsed;
  try {
    parsed = new URL(url);
  }
  catch {
    throw new Error('REDIS_URL must be a valid Redis URL');
  }

  if (!['redis:', 'rediss:'].includes(parsed.protocol)) {
    throw new Error('REDIS_URL must use redis:// or rediss://');
  }

  if (!parsed.hostname) {
    throw new Error('REDIS_URL must include a host');
  }

  if (production && parsed.protocol !== 'rediss:') {
    throw new Error('Production REDIS_URL must use TLS (rediss://)');
  }
  if (production && !parsed.password) {
    throw new Error('Production REDIS_URL must include authentication');
  }
};


const durationSeconds = (value) => {
  const match = /^(\d+)(s|m|h)$/.exec(value);
  if (!match) {
    return NaN;
  }
  const multipliers = { s: 1, m: 60, h: 3600 };
  return Number(match[1]) * multipliers[match[2]];
};


const isUnsafeProductionSecret = (value) => {
  const normalized = String(value || '').toLowerCase();
  return (
    value.length < 48 ||
    new Set(value).size < 8 ||
    /(replace|change|example|placeholder|test-only|development)/.test(normalized)
  );
};


const isTrustedProxyEntry = (entry) => {
  if (['loopback', 'linklocal', 'uniquelocal'].includes(entry)) {
    return true;
  }

  const [address, prefix, ...extra] = entry.split('/');
  if (extra.length > 0) {
    return false;
  }

  const family = isIP(address);
  if (!family) {
    return false;
  }
  if (prefix === undefined) {
    return true;
  }
  if (!/^(?:0|[1-9][0-9]*)$/.test(prefix)) {
    return false;
  }

  const numericPrefix = Number(prefix);
  return numericPrefix <= (family === 4 ? 32 : 128);
};


const validateTestDatabase = (uri) => {
  let parsed;
  try {
    parsed = new URL(uri);
  }
  catch {
    throw new Error('Test MONGO_URI must be a valid local MongoDB URI');
  }

  const localHosts = new Set(['127.0.0.1', 'localhost', '[::1]']);
  const databaseName = parsed.pathname.slice(1).toLowerCase();
  if (
    parsed.protocol !== 'mongodb:' ||
    !localHosts.has(parsed.hostname) ||
    !databaseName.includes('test')
  ) {
    throw new Error(
      'NODE_ENV=test requires a localhost MongoDB database containing "test" in its name'
    );
  }
};


const validateEnvironment = (rawEnvironment) => {
  const nodeEnvironment = rawEnvironment.NODE_ENV || 'development';
  const isProduction = nodeEnvironment === 'production';
  const candidate = {
    ...rawEnvironment,
    CORS_ORIGINS:
      rawEnvironment.CORS_ORIGINS || rawEnvironment.CLIENT_URL,
    FRONTEND_URL:
      rawEnvironment.FRONTEND_URL || rawEnvironment.CLIENT_URL,
    REQUIRE_HTTPS:
      rawEnvironment.REQUIRE_HTTPS ?? (isProduction ? 'true' : 'false'),
    TRUST_PROXY_HOPS:
      rawEnvironment.TRUST_PROXY_HOPS ?? (isProduction ? '1' : '0'),
    REFRESH_COOKIE_SECURE:
      rawEnvironment.REFRESH_COOKIE_SECURE ?? (isProduction ? 'true' : 'false'),
    RATE_LIMIT_STORE:
      nodeEnvironment === 'test'
        ? 'memory'
        : (rawEnvironment.RATE_LIMIT_STORE || (isProduction ? 'redis' : 'memory')),
  };

  const { value, error } = envSchema.validate(candidate, {
    abortEarly: false,
  });
  if (error) {
    throw new Error(`Environment validation error: ${error.message}`);
  }

  const origins = [...new Set(
    value.CORS_ORIGINS
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
  )];
  if (origins.length === 0) {
    throw new Error('CORS_ORIGINS must contain at least one origin');
  }

  const parsedOrigins = origins.map((origin) =>
    parseOrigin(origin, 'CORS_ORIGINS')
  );
  const clientOrigin = parseOrigin(value.CLIENT_URL, 'CLIENT_URL');
  const frontend = parseOrigin(value.FRONTEND_URL, 'FRONTEND_URL');
  if (!origins.includes(clientOrigin.origin)) {
    throw new Error('CLIENT_URL must be listed in CORS_ORIGINS');
  }
  if (!origins.includes(frontend.origin)) {
    throw new Error('FRONTEND_URL origin must be listed in CORS_ORIGINS');
  }

  const trustedProxyCidrs = value.TRUST_PROXY_CIDRS
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (trustedProxyCidrs.some((entry) => !isTrustedProxyEntry(entry))) {
    throw new Error('TRUST_PROXY_CIDRS contains an invalid subnet');
  }

  if (value.NODE_ENV === 'test') {
    validateTestDatabase(value.MONGO_URI);
  }

  if (value.RATE_LIMIT_STORE === 'redis') {
    if (!value.REDIS_URL) {
      throw new Error('REDIS_URL is required when RATE_LIMIT_STORE=redis');
    }
    validateRedisUrl(value.REDIS_URL, isProduction);
  }
  if (value.API_REPLICA_COUNT > 1 && value.RATE_LIMIT_STORE !== 'redis') {
    throw new Error('Multiple API replicas require RATE_LIMIT_STORE=redis');
  }

  const smtpValues = [
    value.SMTP_HOST,
    value.SMTP_USER,
    value.SMTP_PASSWORD,
    value.MAIL_FROM,
  ];
  if (smtpValues.some(Boolean) && !smtpValues.every(Boolean)) {
    throw new Error('SMTP configuration must be either complete or empty');
  }
  if (value.NOTIFICATIONS_ENABLED && !value.CLINIC_NOTIFICATION_EMAIL) {
    throw new Error(
      'CLINIC_NOTIFICATION_EMAIL is required when notifications are enabled'
    );
  }
  if (
    value.NOTIFICATIONS_ENABLED &&
    value.NODE_ENV !== 'test' &&
    !smtpValues.every(Boolean)
  ) {
    throw new Error('Enabled notifications require complete SMTP configuration');
  }
  if (
    value.NOTIFICATION_RETRY_BASE_SECONDS >
    value.NOTIFICATION_RETRY_MAX_SECONDS
  ) {
    throw new Error(
      'NOTIFICATION_RETRY_BASE_SECONDS cannot exceed its maximum'
    );
  }
  if (
    value.NOTIFICATIONS_ENABLED &&
    value.NOTIFICATION_WORKER_LEASE_MS <=
    3 * value.SMTP_CONNECTION_TIMEOUT_MS +
      value.SMTP_SOCKET_TIMEOUT_MS +
      5000
  ) {
    throw new Error(
      'Notification worker lease must exceed the bounded SMTP delivery window'
    );
  }
  const cloudinaryValues = [
    value.CLOUDINARY_CLOUD_NAME,
    value.CLOUDINARY_API_KEY,
    value.CLOUDINARY_API_SECRET,
  ];
  if (cloudinaryValues.some(Boolean) && !cloudinaryValues.every(Boolean)) {
    throw new Error('Cloudinary configuration must be either complete or empty');
  }
  if (value.REFRESH_COOKIE_SAME_SITE === 'none' && !value.REFRESH_COOKIE_SECURE) {
    throw new Error('SameSite=None refresh cookies must be Secure');
  }
  if (value.SESSION_ABSOLUTE_TTL_DAYS < value.REFRESH_TOKEN_TTL_DAYS) {
    throw new Error(
      'SESSION_ABSOLUTE_TTL_DAYS cannot be shorter than the refresh idle TTL'
    );
  }
  if (
    value.MEDIA_CLEANUP_BACKOFF_BASE_SECONDS >
    value.MEDIA_CLEANUP_BACKOFF_MAX_SECONDS
  ) {
    throw new Error(
      'MEDIA_CLEANUP_BACKOFF_BASE_SECONDS cannot exceed its maximum'
    );
  }

  const quotaSecret = value.APPOINTMENT_QUOTA_SECRET || value.JWT_SECRET;
  const rateLimitSecret = value.RATE_LIMIT_KEY_SECRET || quotaSecret;
  const auditSecret = value.AUDIT_PSEUDONYM_SECRET || rateLimitSecret;

  if (isProduction) {
    validateMongoTransport(value.MONGO_URI);

    if (!value.REQUIRE_HTTPS || trustedProxyCidrs.length === 0) {
      throw new Error(
        'Production requires HTTPS enforcement and explicit trusted proxy CIDRs'
      );
    }
    if (!value.REFRESH_COOKIE_SECURE) {
      throw new Error('Production refresh cookies must be Secure');
    }
    if (value.REFRESH_COOKIE_DOMAIN) {
      throw new Error('Production refresh cookies must be host-only');
    }
    if (value.RATE_LIMIT_STORE !== 'redis') {
      throw new Error('Production requires the shared Redis rate-limit store');
    }
    if (
      parsedOrigins.some((origin) => origin.protocol !== 'https:') ||
      frontend.protocol !== 'https:'
    ) {
      throw new Error('Production browser origins must use HTTPS');
    }
    if (
      !value.APPOINTMENT_QUOTA_SECRET ||
      !value.RATE_LIMIT_KEY_SECRET ||
      !value.AUDIT_PSEUDONYM_SECRET ||
      new Set([
        value.JWT_SECRET,
        value.APPOINTMENT_QUOTA_SECRET,
        value.RATE_LIMIT_KEY_SECRET,
        value.AUDIT_PSEUDONYM_SECRET,
      ]).size !== 4 ||
      [
        value.JWT_SECRET,
        value.APPOINTMENT_QUOTA_SECRET,
        value.RATE_LIMIT_KEY_SECRET,
        value.AUDIT_PSEUDONYM_SECRET,
      ].some(isUnsafeProductionSecret)
    ) {
      throw new Error(
        'Production application secrets must be strong, non-placeholder, and independent'
      );
    }
    if (durationSeconds(value.JWT_EXPIRES_IN) > 3600) {
      throw new Error('Production access tokens cannot live longer than one hour');
    }
    if (
      !value.SMTP_HOST || !value.SMTP_USER ||
      !value.SMTP_PASSWORD || !value.MAIL_FROM
    ) {
      throw new Error('Production SMTP configuration is incomplete');
    }
    if (!value.SMTP_SECURE && !value.SMTP_REQUIRE_TLS) {
      throw new Error('Production SMTP must use implicit TLS or require STARTTLS');
    }
    if (
      rawEnvironment.NOTIFICATIONS_ENABLED === undefined ||
      value.NOTIFICATIONS_ENABLED !== true ||
      !value.CLINIC_NOTIFICATION_EMAIL
    ) {
      throw new Error(
        'Production notifications must be explicitly enabled with a clinic recipient'
      );
    }
    if (
      !value.CLOUDINARY_CLOUD_NAME ||
      !value.CLOUDINARY_API_KEY ||
      !value.CLOUDINARY_API_SECRET
    ) {
      throw new Error('Production Cloudinary configuration is incomplete');
    }
    if (!value.ERROR_MONITOR_WEBHOOK_URL) {
      throw new Error('Production error-monitoring webhook is required');
    }
    if (!rawEnvironment.BEFORE_AFTER_CONSENT_VERSION) {
      throw new Error(
        'Production BEFORE_AFTER_CONSENT_VERSION must be explicitly configured'
      );
    }
    if (!rawEnvironment.APPOINTMENT_PRIVACY_POLICY_VERSION) {
      throw new Error(
        'Production APPOINTMENT_PRIVACY_POLICY_VERSION must be explicitly configured'
      );
    }
    if (!rawEnvironment.APPOINTMENT_QUOTA_KEY_VERSION) {
      throw new Error(
        'Production APPOINTMENT_QUOTA_KEY_VERSION must be explicitly configured'
      );
    }
    if (
      value.PUBLIC_BOOKING_CHALLENGE_PROVIDER !== 'turnstile' ||
      !value.PUBLIC_BOOKING_CHALLENGE_SECRET ||
      /(replace|example|placeholder)/i.test(
        value.PUBLIC_BOOKING_CHALLENGE_SECRET
      )
    ) {
      throw new Error(
        'Production public booking requires a configured bot challenge provider'
      );
    }
  }

  return Object.freeze({
    NODE_ENV: value.NODE_ENV,
    PORT: value.PORT,
    MONGO_URI: value.MONGO_URI,
    JWT_SECRET: value.JWT_SECRET,
    JWT_EXPIRES_IN: value.JWT_EXPIRES_IN,
    REFRESH_TOKEN_TTL_DAYS: value.REFRESH_TOKEN_TTL_DAYS,
    SESSION_ABSOLUTE_TTL_DAYS: value.SESSION_ABSOLUTE_TTL_DAYS,
    APPOINTMENT_QUOTA_SECRET: quotaSecret,
    APPOINTMENT_QUOTA_KEY_VERSION: value.APPOINTMENT_QUOTA_KEY_VERSION,
    RATE_LIMIT_KEY_SECRET: rateLimitSecret,
    AUDIT_PSEUDONYM_SECRET: auditSecret,
    APPOINTMENT_PRIVACY_POLICY_VERSION:
      value.APPOINTMENT_PRIVACY_POLICY_VERSION,
    BOOKING_IDEMPOTENCY_TTL_HOURS:
      value.BOOKING_IDEMPOTENCY_TTL_HOURS,
    CLIENT_URL: value.CLIENT_URL,
    CORS_ORIGINS: Object.freeze(origins),
    FRONTEND_URL: value.FRONTEND_URL,
    REQUIRE_HTTPS: value.REQUIRE_HTTPS,
    TRUST_PROXY_HOPS: value.TRUST_PROXY_HOPS,
    TRUST_PROXY_CIDRS: Object.freeze(trustedProxyCidrs),
    REFRESH_COOKIE_SECURE: value.REFRESH_COOKIE_SECURE,
    REFRESH_COOKIE_SAME_SITE: value.REFRESH_COOKIE_SAME_SITE,
    REFRESH_COOKIE_DOMAIN: value.REFRESH_COOKIE_DOMAIN,
    API_REPLICA_COUNT: value.API_REPLICA_COUNT,
    RATE_LIMIT_STORE: value.RATE_LIMIT_STORE,
    REDIS_URL: value.REDIS_URL,
    REDIS_CONNECT_TIMEOUT_MS: value.REDIS_CONNECT_TIMEOUT_MS,
    MEDIA_CLEANUP_MAX_ATTEMPTS: value.MEDIA_CLEANUP_MAX_ATTEMPTS,
    MEDIA_CLEANUP_BACKOFF_BASE_SECONDS:
      value.MEDIA_CLEANUP_BACKOFF_BASE_SECONDS,
    MEDIA_CLEANUP_BACKOFF_MAX_SECONDS:
      value.MEDIA_CLEANUP_BACKOFF_MAX_SECONDS,
    MEDIA_CLEANUP_REFERENCE_RETRY_SECONDS:
      value.MEDIA_CLEANUP_REFERENCE_RETRY_SECONDS,
    MEDIA_CLEANUP_STALE_LOCK_SECONDS:
      value.MEDIA_CLEANUP_STALE_LOCK_SECONDS,
    INVITE_TOKEN_TTL_MINUTES: value.INVITE_TOKEN_TTL_MINUTES,
    RESET_TOKEN_TTL_MINUTES: value.RESET_TOKEN_TTL_MINUTES,
    BEFORE_AFTER_CONSENT_VERSION: value.BEFORE_AFTER_CONSENT_VERSION,
    SMTP_HOST: value.SMTP_HOST,
    SMTP_PORT: value.SMTP_PORT,
    SMTP_SECURE: value.SMTP_SECURE,
    SMTP_REQUIRE_TLS: value.SMTP_REQUIRE_TLS,
    SMTP_USER: value.SMTP_USER,
    SMTP_PASSWORD: value.SMTP_PASSWORD,
    MAIL_FROM: value.MAIL_FROM,
    SMTP_CONNECTION_TIMEOUT_MS: value.SMTP_CONNECTION_TIMEOUT_MS,
    SMTP_SOCKET_TIMEOUT_MS: value.SMTP_SOCKET_TIMEOUT_MS,
    NOTIFICATIONS_ENABLED: value.NOTIFICATIONS_ENABLED,
    CLINIC_NOTIFICATION_EMAIL: value.CLINIC_NOTIFICATION_EMAIL,
    NOTIFICATION_WORKER_POLL_INTERVAL_MS:
      value.NOTIFICATION_WORKER_POLL_INTERVAL_MS,
    NOTIFICATION_WORKER_LEASE_MS: value.NOTIFICATION_WORKER_LEASE_MS,
    NOTIFICATION_WORKER_CONCURRENCY:
      value.NOTIFICATION_WORKER_CONCURRENCY,
    NOTIFICATION_MAX_ATTEMPTS: value.NOTIFICATION_MAX_ATTEMPTS,
    NOTIFICATION_RETRY_BASE_SECONDS:
      value.NOTIFICATION_RETRY_BASE_SECONDS,
    NOTIFICATION_RETRY_MAX_SECONDS:
      value.NOTIFICATION_RETRY_MAX_SECONDS,
    NOTIFICATION_RETENTION_DAYS: value.NOTIFICATION_RETENTION_DAYS,
    CLINIC_TIMEZONE: value.CLINIC_TIMEZONE,
    CLOUDINARY_CLOUD_NAME: value.CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY: value.CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET: value.CLOUDINARY_API_SECRET,
    LOG_LEVEL: value.LOG_LEVEL,
    ERROR_MONITOR_WEBHOOK_URL: value.ERROR_MONITOR_WEBHOOK_URL,
    HEALTH_CHECK_TIMEOUT_MS: value.HEALTH_CHECK_TIMEOUT_MS,
    READINESS_CACHE_MS: value.READINESS_CACHE_MS,
    READINESS_FAILURE_CACHE_MS: value.READINESS_FAILURE_CACHE_MS,
    GRACEFUL_SHUTDOWN_TIMEOUT_MS: value.GRACEFUL_SHUTDOWN_TIMEOUT_MS,
    PUBLIC_BOOKING_CHALLENGE_PROVIDER:
      value.PUBLIC_BOOKING_CHALLENGE_PROVIDER,
    PUBLIC_BOOKING_CHALLENGE_SECRET:
      value.PUBLIC_BOOKING_CHALLENGE_SECRET,
    PUBLIC_BOOKING_CHALLENGE_TIMEOUT_MS:
      value.PUBLIC_BOOKING_CHALLENGE_TIMEOUT_MS,
  });
};


const env = validateEnvironment(process.env);


export { validateEnvironment };
export default env;
