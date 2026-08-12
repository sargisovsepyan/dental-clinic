import express from 'express';

import {
    login,
    refresh,
    logout,
    getMe,
} from './auth.controller.js';

import {
    loginSchema,
} from './auth.validation.js';

import auth from '../../middlewares/auth.js';
import validate from '../../middlewares/validate.js';

import {
    authLimiter,
    refreshLimiter,
} from '../../middlewares/rateLimiter.js';

import asyncHandler from '../../utils/asyncHandler.js';

const router = express.Router();

router.post(
    '/login',
    authLimiter,
    validate(loginSchema),
    asyncHandler(login)
);

router.post(
    '/refresh',
    refreshLimiter,
    asyncHandler(refresh)
);

router.post(
    '/logout',
    asyncHandler(logout)
);

router.get(
    '/me',
    auth,
    asyncHandler(getMe)
);

export default router;