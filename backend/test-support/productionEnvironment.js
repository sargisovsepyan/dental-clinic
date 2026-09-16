// Synthetic configuration-only fixture. Never deploy or connect using these values.
const syntheticSecret = (role) => `${role}A7!mQ2#zK9@pL4$xR8&vN6*`.repeat(3);
const redisUrl = new URL('rediss://redis.example.test:6380/0');
redisUrl.username = 'limiter';
redisUrl.password = syntheticSecret('redis');

const productionEnvironment = (overrides = {}) => ({
  NODE_ENV: 'production', PORT: '5000',
  MONGO_URI: 'mongodb+srv://cluster.example/dental_clinic',
  JWT_SECRET: syntheticSecret('jwt'),
  APPOINTMENT_QUOTA_SECRET: syntheticSecret('quota'),
  RATE_LIMIT_KEY_SECRET: syntheticSecret('limit'),
  AUDIT_PSEUDONYM_SECRET: syntheticSecret('audit'),
  APPOINTMENT_QUOTA_KEY_VERSION: 'v1', APPOINTMENT_PRIVACY_POLICY_VERSION: '2026-01',
  CLIENT_URL: 'https://clinic.example.test', FRONTEND_URL: 'https://clinic.example.test',
  CORS_ORIGINS: 'https://clinic.example.test',
  REQUIRE_HTTPS: 'true', TRUST_PROXY_CIDRS: '10.0.0.0/8',
  REFRESH_COOKIE_SECURE: 'true', RATE_LIMIT_STORE: 'redis', REDIS_URL: redisUrl.toString(),
  SMTP_HOST: 'smtp.example.test', SMTP_USER: 'mailer', SMTP_PASSWORD: syntheticSecret('smtp'),
  MAIL_FROM: 'clinic@example.test', NOTIFICATIONS_ENABLED: 'true',
  CLINIC_NOTIFICATION_EMAIL: 'reception@example.test', BEFORE_AFTER_CONSENT_VERSION: '2026-01',
  CLOUDINARY_CLOUD_NAME: 'clinic-cloud', CLOUDINARY_API_KEY: '123456789012345',
  CLOUDINARY_API_SECRET: syntheticSecret('media'),
  ERROR_MONITOR_WEBHOOK_URL: 'https://monitor.example.test/report',
  PUBLIC_BOOKING_CHALLENGE_PROVIDER: 'turnstile', PUBLIC_BOOKING_CHALLENGE_SECRET: syntheticSecret('challenge'),
  ...overrides,
});

export { productionEnvironment };
