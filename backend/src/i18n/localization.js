import mongoose from 'mongoose';
import Joi from 'joi';

import ApiError from '../utils/ApiError.js';

const SUPPORTED_LOCALES = Object.freeze([
  'hy',
  'ru',
  'en',
]);

const PRIMARY_LOCALE = 'hy';

const createTranslationsSchema = (
  translationSchema
) => new mongoose.Schema(
  Object.fromEntries(
    SUPPORTED_LOCALES.map((locale) => [
      locale,
      {
        type: translationSchema,
        default: undefined,
      },
    ])
  ),
  {
    _id: false,
    strict: 'throw',
  }
);

const createJoiTranslations = (
  translationSchema
) => Joi.object(
  Object.fromEntries(
    SUPPORTED_LOCALES.map((locale) => [
      locale,
      translationSchema,
    ])
  )
).min(1);

const createMultipartTranslations = (
  translationSchema
) => Joi.any().custom((input, helpers) => {
  let value = input;

  if (typeof input === 'string') {
    if (input.length > 20_000) {
      return helpers.error('string.max');
    }

    try {
      value = JSON.parse(input);
    }
    catch {
      return helpers.error('any.invalid');
    }
  }

  const result = createJoiTranslations(
    translationSchema
  ).validate(value, {
    abortEarly: false,
    stripUnknown: false,
  });

  return result.error
    ? helpers.error('any.invalid')
    : result.value;
});

const assertSupportedTranslationKeys = (
  value
) => {
  if (
    value === undefined ||
    value === null ||
    typeof value === 'string'
  ) {
    return;
  }

  if (
    Array.isArray(value) ||
    typeof value !== 'object'
  ) {
    return;
  }

  const unsupported = Object.keys(value)
    .filter(
      (key) => !SUPPORTED_LOCALES.includes(key)
    );

  if (unsupported.length) {
    throw new ApiError(
      400,
      `Unsupported translation locale: ${unsupported[0]}`
    );
  }
};

const mergeTranslations = (
  current,
  incoming
) => {
  const merged = current?.toObject?.() || {
    ...(current || {}),
  };

  for (const locale of SUPPORTED_LOCALES) {
    if (incoming?.[locale] === undefined) {
      continue;
    }

    merged[locale] = {
      ...(merged[locale] || {}),
      ...incoming[locale],
    };
  }

  return merged;
};

const hasPrimaryContent = (
  translations,
  requiredFields
) => {
  const primary = translations?.[PRIMARY_LOCALE];

  if (!primary) {
    return false;
  }

  return requiredFields.every((field) => {
    const value = primary[field];

    if (Array.isArray(value)) {
      return value.length > 0;
    }

    return (
      typeof value === 'string' &&
      value.trim().length > 0
    );
  });
};

const requirePrimaryContent = (
  document,
  requiredFields,
  label
) => {
  if (
    document.isActive !== false &&
    !hasPrimaryContent(
      document.translations,
      requiredFields
    )
  ) {
    document.invalidate(
      `translations.${PRIMARY_LOCALE}`,
      `${label} requires Armenian (${PRIMARY_LOCALE}) content before publication`
    );
  }
};

export {
  SUPPORTED_LOCALES,
  PRIMARY_LOCALE,
  createTranslationsSchema,
  createJoiTranslations,
  createMultipartTranslations,
  assertSupportedTranslationKeys,
  mergeTranslations,
  hasPrimaryContent,
  requirePrimaryContent,
};
