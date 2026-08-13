import 'dotenv/config';
import Joi from 'joi';


const timeZone = Joi.string()
  .custom((value, helpers) => {
    try {
      new Intl.DateTimeFormat(
        'en-US',
        {
          timeZone: value,
        }
      ).format();

      return value;
    }
    catch {
      return helpers.error(
        'any.invalid'
      );
    }
  })
  .messages({
    'any.invalid':
      '{{#label}} must be a valid IANA time zone',
  });


const envSchema = Joi.object({
  NODE_ENV:
    Joi.string()
      .valid(
        'development',
        'test',
        'production'
      )
      .default('development'),

  PORT:
    Joi.number()
      .integer()
      .min(1)
      .max(65535)
      .default(5000),

  MONGO_URI:
    Joi.string()
      .required(),

  JWT_SECRET:
    Joi.string()
      .min(32)
      .required(),

  JWT_EXPIRES_IN:
    Joi.string()
      .default('15m'),

  REFRESH_TOKEN_TTL_DAYS:
    Joi.number()
      .integer()
      .min(1)
      .max(30)
      .default(7),

  APPOINTMENT_QUOTA_SECRET:
    Joi.string()
      .allow('')
      .min(32)
      .default(''),

  CLIENT_URL:
    Joi.string()
      .required(),

  FRONTEND_URL:
    Joi.string()
      .uri({ scheme: ['http', 'https'] })
      .default(Joi.ref('CLIENT_URL')),

  INVITE_TOKEN_TTL_MINUTES:
    Joi.number()
      .integer()
      .min(5)
      .max(10080)
      .default(1440),

  RESET_TOKEN_TTL_MINUTES:
    Joi.number()
      .integer()
      .min(5)
      .max(1440)
      .default(30),

  SMTP_HOST:
    Joi.string().allow('').default(''),

  SMTP_PORT:
    Joi.number()
      .integer()
      .min(1)
      .max(65535)
      .default(587),

  SMTP_SECURE:
    Joi.boolean().default(false),

  SMTP_USER:
    Joi.string().allow('').default(''),

  SMTP_PASSWORD:
    Joi.string().allow('').default(''),

  MAIL_FROM:
    Joi.string().allow('').default(''),

  CLINIC_TIMEZONE:
    timeZone
      .default('Asia/Yerevan'),

  CLOUDINARY_CLOUD_NAME:
    Joi.string()
      .allow('')
      .default(''),

  CLOUDINARY_API_KEY:
    Joi.string()
      .allow('')
      .default(''),

  CLOUDINARY_API_SECRET:
    Joi.string()
      .allow('')
      .default(''),
})
  .unknown(true);


const {
  value,
  error,
} = envSchema.validate(
  process.env,
  {
    abortEarly: false,
  }
);


if (error) {
  throw new Error(
    `Environment validation error: ${error.message}`
  );
}


const env = {
  NODE_ENV:
    value.NODE_ENV,

  PORT:
    value.PORT,

  MONGO_URI:
    value.MONGO_URI,

  JWT_SECRET:
    value.JWT_SECRET,

  JWT_EXPIRES_IN:
    value.JWT_EXPIRES_IN,

  REFRESH_TOKEN_TTL_DAYS:
    value.REFRESH_TOKEN_TTL_DAYS,

  APPOINTMENT_QUOTA_SECRET:
    value.APPOINTMENT_QUOTA_SECRET ||
    value.JWT_SECRET,

  CLIENT_URL:
    value.CLIENT_URL,

  FRONTEND_URL:
    value.FRONTEND_URL,

  INVITE_TOKEN_TTL_MINUTES:
    value.INVITE_TOKEN_TTL_MINUTES,

  RESET_TOKEN_TTL_MINUTES:
    value.RESET_TOKEN_TTL_MINUTES,

  SMTP_HOST: value.SMTP_HOST,
  SMTP_PORT: value.SMTP_PORT,
  SMTP_SECURE: value.SMTP_SECURE,
  SMTP_USER: value.SMTP_USER,
  SMTP_PASSWORD: value.SMTP_PASSWORD,
  MAIL_FROM: value.MAIL_FROM,

  CLINIC_TIMEZONE:
    value.CLINIC_TIMEZONE,

  CLOUDINARY_CLOUD_NAME:
    value.CLOUDINARY_CLOUD_NAME,

  CLOUDINARY_API_KEY:
    value.CLOUDINARY_API_KEY,

  CLOUDINARY_API_SECRET:
    value.CLOUDINARY_API_SECRET,
};


export default env;
