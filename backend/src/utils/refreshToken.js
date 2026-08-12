import crypto from 'crypto';

import env from '../config/env.js';

const generateRefreshToken = () => {
    return crypto.randomBytes(64).toString('hex');
};

const hashToken = (token) => {
    return crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');
};

const getRefreshTokenExpiry = () => {
    const expiresAt = new Date();

    expiresAt.setDate(
        expiresAt.getDate() +
        env.REFRESH_TOKEN_TTL_DAYS
    );

    return expiresAt;
};

export {
    generateRefreshToken,
    hashToken,
    getRefreshTokenExpiry,
};