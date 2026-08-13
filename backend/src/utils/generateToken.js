import jwt from 'jsonwebtoken';

import env from '../config/env.js';

const generateToken = (user) => {
    return jwt.sign(
        {
            sub: user._id.toString(),
            role: user.role,
            ver: user.authVersion ?? 0,
        },
        env.JWT_SECRET,
        {
            algorithm: 'HS256',
            expiresIn: env.JWT_EXPIRES_IN,
        }
    );
};

export default generateToken;
