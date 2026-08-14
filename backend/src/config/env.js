import dotenv from 'dotenv';
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


const envSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().integer().min(1).max(65535).default(5000),
  MONGO_URI: Joi.string().required(),

  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: Joi.number()
    .integer().min(1).max(30).default(7),
  APPOINTMENT_QUOTA_SECRET: Joi.string()
    .allow('').min(32).default(''),
  RATE_LIMIT_KEY_SECRET: Joi.string()
    .allow('').min(32).default(''),

  CLIENT_URL: Joi.string().required(),
  CORS_ORIGINS: Joi.string().required(),
  FRONTEND_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] }).required(),
  REQUIRE_HTTPS: Joi.boolean().required(),
  TRUST_PROXY_HOPS: Joi.number()
    .integer().min(0).max(10).required(),
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

  INVITE_TOKEN_TTL_MINUTES: Joi.number()
    .integer().min(5).max(10080).default(1440),
  RESET_TOKEN_TTL_MINUTES: Joi.number()
    .integer().min(5).max(1440).default(30),

  SMTP_HOST: Joi.string().allow('').default(''),
  SMTP_PORT: Joi.number().integer().min(1).max(65535).default(587),
  SMTP_SECURE: Joi.boolean().default(false),
  SMTP_USER: Joi.string().allow('').default(''),
  SMTP_PASSWORD: Joi.string().allow('').default(''),
  MAIL_FROM: Joi.string().allow('').default(''),

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
  GRACEFUL_SHUTDOWN_TIMEOUT_MS: Joi.number()
    .integer().min(1000).max(120000).default(15000),
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

  if (production && parsed.protocol !== 'rediss:') {
    throw new Error('Production REDIS_URL must use TLS (rediss://)');
  }
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
  const frontend = new URL(value.FRONTEND_URL);
  if (!origins.includes(clientOrigin.origin)) {
    throw new Error('CLIENT_URL must be listed in CORS_ORIGINS');
  }
  if (!origins.includes(frontend.origin)) {
    throw new Error('FRONTEND_URL origin must be listed in CORS_ORIGINS');
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

  const quotaSecret = value.APPOINTMENT_QUOTA_SECRET || value.JWT_SECRET;
  const rateLimitSecret = value.RATE_LIMIT_KEY_SECRET || quotaSecret;

  if (isProduction) {
    validateMongoTransport(value.MONGO_URI);

    if (!value.REQUIRE_HTTPS || value.TRUST_PROXY_HOPS < 1) {
      throw new Error(
        'Production requires HTTPS enforcement and at least one trusted proxy hop'
      );
    }
    if (!value.REFRESH_COOKIE_SECURE) {
      throw new Error('Production refresh cookies must be Secure');
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
      new Set([
        value.JWT_SECRET,
        value.APPOINTMENT_QUOTA_SECRET,
        value.RATE_LIMIT_KEY_SECRET,
      ]).size !== 3
    ) {
      throw new Error(
        'Production JWT, appointment quota, and rate-limit secrets must be independent'
      );
    }
    if (
      !value.SMTP_HOST || !value.SMTP_USER ||
      !value.SMTP_PASSWORD || !value.MAIL_FROM
    ) {
      throw new Error('Production SMTP configuration is incomplete');
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
  }

  return Object.freeze({
    NODE_ENV: value.NODE_ENV,
    PORT: value.PORT,
    MONGO_URI: value.MONGO_URI,
    JWT_SECRET: value.JWT_SECRET,
    JWT_EXPIRES_IN: value.JWT_EXPIRES_IN,
    REFRESH_TOKEN_TTL_DAYS: value.REFRESH_TOKEN_TTL_DAYS,
    APPOINTMENT_QUOTA_SECRET: quotaSecret,
    RATE_LIMIT_KEY_SECRET: rateLimitSecret,
    CLIENT_URL: value.CLIENT_URL,
    CORS_ORIGINS: Object.freeze(origins),
    FRONTEND_URL: value.FRONTEND_URL,
    REQUIRE_HTTPS: value.REQUIRE_HTTPS,
    TRUST_PROXY_HOPS: value.TRUST_PROXY_HOPS,
    REFRESH_COOKIE_SECURE: value.REFRESH_COOKIE_SECURE,
    REFRESH_COOKIE_SAME_SITE: value.REFRESH_COOKIE_SAME_SITE,
    REFRESH_COOKIE_DOMAIN: value.REFRESH_COOKIE_DOMAIN,
    API_REPLICA_COUNT: value.API_REPLICA_COUNT,
    RATE_LIMIT_STORE: value.RATE_LIMIT_STORE,
    REDIS_URL: value.REDIS_URL,
    REDIS_CONNECT_TIMEOUT_MS: value.REDIS_CONNECT_TIMEOUT_MS,
    INVITE_TOKEN_TTL_MINUTES: value.INVITE_TOKEN_TTL_MINUTES,
    RESET_TOKEN_TTL_MINUTES: value.RESET_TOKEN_TTL_MINUTES,
    SMTP_HOST: value.SMTP_HOST,
    SMTP_PORT: value.SMTP_PORT,
    SMTP_SECURE: value.SMTP_SECURE,
    SMTP_USER: value.SMTP_USER,
    SMTP_PASSWORD: value.SMTP_PASSWORD,
    MAIL_FROM: value.MAIL_FROM,
    CLINIC_TIMEZONE: value.CLINIC_TIMEZONE,
    CLOUDINARY_CLOUD_NAME: value.CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY: value.CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET: value.CLOUDINARY_API_SECRET,
    LOG_LEVEL: value.LOG_LEVEL,
    ERROR_MONITOR_WEBHOOK_URL: value.ERROR_MONITOR_WEBHOOK_URL,
    HEALTH_CHECK_TIMEOUT_MS: value.HEALTH_CHECK_TIMEOUT_MS,
    GRACEFUL_SHUTDOWN_TIMEOUT_MS: value.GRACEFUL_SHUTDOWN_TIMEOUT_MS,
  });
};


const env = validateEnvironment(process.env);


export { validateEnvironment };
export default env;
