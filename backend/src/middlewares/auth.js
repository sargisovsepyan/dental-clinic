import jwt from 'jsonwebtoken';

import User from '../modules/users/user.model.js';

import env from '../config/env.js';

import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

const auth = asyncHandler(
    async (req, res, next) => {
        const authorization =
            req.headers.authorization;

        if (
            !authorization ||
            !authorization.startsWith(
                'Bearer '
            )
        ) {
            throw new ApiError(
                401,
                'Authentication required'
            );
        }

        const token =
            authorization.slice(7);

        let decoded;

        try {
            decoded = jwt.verify(
                token,
                env.JWT_SECRET
            );
        } catch {
            throw new ApiError(
                401,
                'Invalid or expired token'
            );
        }

        const user =
            await User.findById(
                decoded.sub
            );

        if (
            !user ||
            !user.isActive
        ) {
            throw new ApiError(
                401,
                'User is no longer available'
            );
        }

        req.user = {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
        };

        next();
    }
);

export default auth;