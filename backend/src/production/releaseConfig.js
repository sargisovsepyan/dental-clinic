import { mongoOptions } from '../config/env.js';

const isReservedHost = (host) => /(^|\.)(example\.(com|net|org|test|invalid)|example|test|invalid)$/i.test(host);

// Reserved fixtures are valid for configuration-only tests, NEVER live startup.
const assertReleaseEndpoints = (environment) => {
  if (environment.NODE_ENV !== 'production') return;
  const mongo = mongoOptions(environment.MONGO_URI);
  const hosts = [
    mongo.srvHost, ...(mongo.hosts || []).map(({ host }) => host),
    new URL(environment.REDIS_URL).hostname,
    environment.SMTP_HOST,
    new URL(environment.ERROR_MONITOR_WEBHOOK_URL).hostname,
    ...environment.CORS_ORIGINS.map((origin) => new URL(origin).hostname),
  ].filter(Boolean);
  if (hosts.some(isReservedHost)) throw new Error('Production release cannot use reserved fixture endpoints');
};

export { assertReleaseEndpoints };
