import Joi from 'joi';

const MAX_PUBLIC_URL_LENGTH = 2048;

const SOCIAL_HOSTS = Object.freeze({
  instagram: new Set([
    'instagram.com',
    'www.instagram.com',
  ]),
  facebook: new Set([
    'facebook.com',
    'www.facebook.com',
    'm.facebook.com',
  ]),
  whatsapp: new Set([
    'wa.me',
    'api.whatsapp.com',
    'www.whatsapp.com',
  ]),
  telegram: new Set([
    't.me',
    'telegram.me',
  ]),
});

const parseSafeHttpsUrl = (value) => {
  if (typeof value !== 'string' || value.length > MAX_PUBLIC_URL_LENGTH) {
    return null;
  }

  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password
    ) {
      return null;
    }
    return parsed;
  }
  catch {
    return null;
  }
};

const isSafeHttpsUrl = (value) => Boolean(
  value === '' || parseSafeHttpsUrl(value)
);

const isAllowedSocialUrl = (platform, value) => {
  if (value === '') {
    return true;
  }

  const parsed = parseSafeHttpsUrl(value);
  return Boolean(
    parsed && SOCIAL_HOSTS[platform]?.has(parsed.hostname.toLowerCase())
  );
};

const safeHttpsUrl = Joi.string()
  .trim()
  .max(MAX_PUBLIC_URL_LENGTH)
  .custom((value, helpers) => (
    isSafeHttpsUrl(value)
      ? value
      : helpers.error('any.invalid')
  ))
  .messages({
    'any.invalid': '{{#label}} must be a safe HTTPS URL without credentials',
  });

const safeSocialUrl = (platform) => safeHttpsUrl.custom(
  (value, helpers) => (
    isAllowedSocialUrl(platform, value)
      ? value
      : helpers.error('any.invalid')
  )
).messages({
  'any.invalid': `{{#label}} must use an approved HTTPS ${platform} URL`,
});

export {
  MAX_PUBLIC_URL_LENGTH,
  SOCIAL_HOSTS,
  isSafeHttpsUrl,
  isAllowedSocialUrl,
  safeHttpsUrl,
  safeSocialUrl,
};
