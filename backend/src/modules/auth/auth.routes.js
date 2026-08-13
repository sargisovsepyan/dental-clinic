import express from 'express';

import {
  login,
  refresh,
  logout,
  getMe,
  changePassword,
  forgotPassword,
  resetPassword,
  setupPassword,
} from './auth.controller.js';

import {
  loginSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  setupPasswordSchema,
} from './auth.validation.js';

import auth from '../../middlewares/auth.js';

import validate from '../../middlewares/validate.js';

import {
  authLimiter,
  refreshLimiter,
  passwordRecoveryLimiter,
  passwordSetupLimiter,
} from '../../middlewares/rateLimiter.js';

import asyncHandler from '../../utils/asyncHandler.js';

import auditAction from '../audit/audit.middleware.js';


const router =
  express.Router();


router.post(
  '/login',
  authLimiter,
  validate(
    loginSchema
  ),
  auditAction(
    {
      action:
        'auth.login.success',

      entityType:
        'user',

      actorFromResponse:
        true,
    },

    login
  )
);


router.post(
  '/refresh',
  refreshLimiter,
  asyncHandler(
    refresh
  )
);


router.post(
  '/logout',
  asyncHandler(
    logout
  )
);


router.get(
  '/me',
  auth,
  asyncHandler(
    getMe
  )
);


router.post(
  '/change-password',
  auth,
  passwordSetupLimiter,
  validate(changePasswordSchema),
  auditAction(
    {
      action: 'auth.password.changed',
      entityType: 'user',
    },
    changePassword
  )
);

router.post(
  '/forgot-password',
  passwordRecoveryLimiter,
  validate(forgotPasswordSchema),
  asyncHandler(forgotPassword)
);

router.post(
  '/reset-password',
  passwordSetupLimiter,
  validate(resetPasswordSchema),
  auditAction(
    {
      action: 'auth.password.reset',
      entityType: 'user',
      actorFromResponse: true,
    },
    resetPassword
  )
);

router.post(
  '/setup-password',
  passwordSetupLimiter,
  validate(setupPasswordSchema),
  auditAction(
    {
      action: 'auth.invitation.accepted',
      entityType: 'user',
      actorFromResponse: true,
    },
    setupPassword
  )
);

export default router;
