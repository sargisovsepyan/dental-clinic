import crypto from 'crypto';

import env from '../config/env.js';

const REFRESH_TOKEN_FAMILY_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


const generateRefreshTokenFamilyId = () => (
    crypto.randomUUID()
);


const generateRefreshToken = (
    familyId = generateRefreshTokenFamilyId()
) => {
    return `${familyId}.${crypto.randomBytes(64).toString('hex')}`;
};

const hashToken = (token) => {
    return crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');
};

const getRefreshTokenFamilyId = (token) => {
    if (typeof token !== 'string') {
        return '';
    }

    const separator = token.indexOf('.');
    if (separator < 1) {
        return '';
    }

    const familyId = token.slice(0, separator);
    const secret = token.slice(separator + 1);
    return (
        REFRESH_TOKEN_FAMILY_PATTERN.test(familyId) &&
        /^[a-f0-9]{128}$/i.test(secret)
    )
        ? familyId.toLowerCase()
        : '';
};


const addDays = (date, days) => (
    new Date(date.getTime() + days * 24 * 60 * 60 * 1000)
);


const getSessionAbsoluteExpiry = (
    now = new Date()
) => addDays(now, env.SESSION_ABSOLUTE_TTL_DAYS);


const getRefreshTokenExpiry = (
    now = new Date(),
    absoluteExpiresAt = null
) => {
    const idleExpiry = addDays(
        now,
        env.REFRESH_TOKEN_TTL_DAYS
    );

    return absoluteExpiresAt && absoluteExpiresAt < idleExpiry
        ? new Date(absoluteExpiresAt)
        : idleExpiry;
};

export {
    REFRESH_TOKEN_FAMILY_PATTERN,
    generateRefreshTokenFamilyId,
    generateRefreshToken,
    getRefreshTokenFamilyId,
    hashToken,
    getRefreshTokenExpiry,
    getSessionAbsoluteExpiry,
};
