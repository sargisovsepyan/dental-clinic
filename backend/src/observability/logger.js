import env from '../config/env.js';


const LEVELS = Object.freeze({
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
});

const SENSITIVE_KEY_PARTS = [
  'password',
  'secret',
  'token',
  'authorization',
  'cookie',
  'email',
  'phone',
  'patient',
];


const redactText = (value) => String(value)
  .replace(/Bearer\s+[^\s]+/gi, 'Bearer [REDACTED]')
  .replace(
    /([?&](?:token|key|secret|password)=)[^&\s]+/gi,
    '$1[REDACTED]'
  )
  .replace(
    /\b[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
    '[REDACTED_JWT]'
  )
  .slice(0, 2000);


const sanitizeLogValue = (value, depth = 0) => {
  if (depth > 4 || value === undefined) {
    return undefined;
  }
  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    return redactText(value);
  }
  if (value instanceof Error) {
    return {
      name: redactText(value.name),
      message: env.NODE_ENV === 'production'
        ? 'Internal error'
        : redactText(value.message),
      ...(env.NODE_ENV !== 'production' && value.stack
        ? { stack: redactText(value.stack) }
        : {}),
    };
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20)
      .map((item) => sanitizeLogValue(item, depth + 1))
      .filter((item) => item !== undefined);
  }
  if (typeof value === 'object') {
    const sanitized = {};
    for (const [key, child] of Object.entries(value)) {
      const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
      if (SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part))) {
        sanitized[key] = '[REDACTED]';
        continue;
      }
      const cleanChild = sanitizeLogValue(child, depth + 1);
      if (cleanChild !== undefined) {
        sanitized[key] = cleanChild;
      }
    }
    return sanitized;
  }
  return undefined;
};


const write = (level, event, metadata = {}) => {
  if (LEVELS[level] < LEVELS[env.LOG_LEVEL]) {
    return;
  }

  const record = {
    timestamp: new Date().toISOString(),
    level,
    event: redactText(event),
    ...sanitizeLogValue(metadata),
  };

  if (env.NODE_ENV === 'production') {
    const output = `${JSON.stringify(record)}\n`;
    (level === 'error' ? process.stderr : process.stdout).write(output);
    return;
  }

  if (env.NODE_ENV !== 'test') {
    const method = level === 'debug' ? 'log' : level;
    console[method](record);
  }
};


const logger = Object.freeze({
  debug: (event, metadata) => write('debug', event, metadata),
  info: (event, metadata) => write('info', event, metadata),
  warn: (event, metadata) => write('warn', event, metadata),
  error: (event, metadata) => write('error', event, metadata),
});


export { redactText, sanitizeLogValue };
export default logger;
