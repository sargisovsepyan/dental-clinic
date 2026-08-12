import 'dotenv/config';
import Joi from 'joi';

const envSchema = Joi.object({
    NODE_ENV: Joi.string()
        .valid('development', 'test', 'production')
        .default('development'),

    PORT: Joi.number()
        .integer()
        .min(1)
        .max(65535)
        .default(5000),

    MONGO_URI: Joi.string()
        .required(),

    JWT_SECRET: Joi.string()
        .min(32)
        .required(),

    JWT_EXPIRES_IN: Joi.string()
        .default('15m'),

    REFRESH_TOKEN_TTL_DAYS: Joi.number()
        .integer()
        .min(1)
        .max(30)
        .default(7),

    CLIENT_URL: Joi.string()
        .required(),

    CLINIC_TIMEZONE: Joi.string()
        .default('Asia/Yerevan'),
})
    .unknown(true);

const { value, error } = envSchema.validate(process.env, {
    abortEarly: false,
});

if (error) {
    throw new Error(
        `Environment validation error: ${error.message}`
    );
}

const env = {
    NODE_ENV: value.NODE_ENV,
    PORT: value.PORT,
    MONGO_URI: value.MONGO_URI,

    JWT_SECRET: value.JWT_SECRET,
    JWT_EXPIRES_IN: value.JWT_EXPIRES_IN,

    REFRESH_TOKEN_TTL_DAYS:
        value.REFRESH_TOKEN_TTL_DAYS,

    CLIENT_URL: value.CLIENT_URL,
    CLINIC_TIMEZONE: value.CLINIC_TIMEZONE,
};

export default env;