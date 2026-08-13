import Joi from 'joi';

const PASSWORD_MIN_CHARACTERS = 6;
const BCRYPT_MAX_BYTES = 72;
const LOGIN_PASSWORD_MAX_CHARACTERS = 1024;

const getCharacterLength = (password) => (
  Array.from(password).length
);

const getPasswordByteLength = (password) => (
  Buffer.byteLength(password, 'utf8')
);

const validateNewPassword = (password) => {
  if (typeof password !== 'string') {
    return 'Password must be a string';
  }

  if (
    getCharacterLength(password) <
    PASSWORD_MIN_CHARACTERS
  ) {
    return 'Password must contain at least 6 characters';
  }

  if (
    getPasswordByteLength(password) >
    BCRYPT_MAX_BYTES
  ) {
    return 'Password must not exceed 72 UTF-8 bytes';
  }

  return null;
};

const newPasswordJoi = Joi.string()
  .custom((value, helpers) => {
    const error = validateNewPassword(value);

    return error
      ? helpers.message({ custom: error })
      : value;
  })
  .messages({
    custom: '{{#message}}',
  });

const loginPasswordJoi = Joi.string()
  .min(PASSWORD_MIN_CHARACTERS)
  .max(LOGIN_PASSWORD_MAX_CHARACTERS);

export {
  PASSWORD_MIN_CHARACTERS,
  BCRYPT_MAX_BYTES,
  LOGIN_PASSWORD_MAX_CHARACTERS,
  getCharacterLength,
  getPasswordByteLength,
  validateNewPassword,
  newPasswordJoi,
  loginPasswordJoi,
};
