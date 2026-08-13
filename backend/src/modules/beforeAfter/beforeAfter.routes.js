import express from 'express';


import {
  createCase,
  getCases,
  getCase,
  getAdminCases,
  updateCase,
  replaceBeforeImage,
  replaceAfterImage,
  disableCase,
  restoreCase,
} from './beforeAfter.controller.js';


import {
  createCaseSchema,
  updateCaseSchema,
  caseIdSchema,
  listCasesSchema,
} from './beforeAfter.validation.js';


import auth from '../../middlewares/auth.js';

import authorize from '../../middlewares/authorize.js';

import validate from '../../middlewares/validate.js';

import asyncHandler from '../../utils/asyncHandler.js';

import auditAction from '../audit/audit.middleware.js';

import {
  handleImageUpload,
  verifyImageSignature,
  handleBeforeAfterUpload,
  verifyBeforeAfterSignatures,
} from '../../middlewares/uploadImage.js';

import {
  mediaUploadLimiter,
} from '../../middlewares/rateLimiter.js';


const router =
  express.Router();


router.get(
  '/',
  validate(
    listCasesSchema
  ),
  asyncHandler(
    getCases
  )
);


router.get(
  '/admin/all',
  auth,
  authorize('admin'),
  validate(
    listCasesSchema
  ),
  asyncHandler(
    getAdminCases
  )
);


router.post(
  '/',
  auth,
  authorize('admin'),

  mediaUploadLimiter,

  handleBeforeAfterUpload,
  verifyBeforeAfterSignatures,

  validate(
    createCaseSchema
  ),

  auditAction(
    {
      action:
        'before_after.create',

      entityType:
        'before_after',

      metadata:
        (req) => ({
          title:
            req.body.title,

          serviceId:
            req.body.serviceId ||
            null,

          dentistId:
            req.body.dentistId ||
            null,
        }),
    },

    createCase
  )
);


router.patch(
  '/:id/restore',
  auth,
  authorize('admin'),

  validate(
    caseIdSchema
  ),

  auditAction(
    {
      action:
        'before_after.restore',

      entityType:
        'before_after',
    },

    restoreCase
  )
);


router.put(
  '/:id/before-image',
  auth,
  authorize('admin'),

  validate(
    caseIdSchema
  ),

  mediaUploadLimiter,

  handleImageUpload,
  verifyImageSignature,

  auditAction(
    {
      action:
        'before_after.before_image.update',

      entityType:
        'before_after',
    },

    replaceBeforeImage
  )
);


router.put(
  '/:id/after-image',
  auth,
  authorize('admin'),

  validate(
    caseIdSchema
  ),

  mediaUploadLimiter,

  handleImageUpload,
  verifyImageSignature,

  auditAction(
    {
      action:
        'before_after.after_image.update',

      entityType:
        'before_after',
    },

    replaceAfterImage
  )
);


router.patch(
  '/:id',
  auth,
  authorize('admin'),

  validate(
    updateCaseSchema
  ),

  auditAction(
    {
      action:
        'before_after.update',

      entityType:
        'before_after',
    },

    updateCase
  )
);


router.delete(
  '/:id',
  auth,
  authorize('admin'),

  validate(
    caseIdSchema
  ),

  auditAction(
    {
      action:
        'before_after.disable',

      entityType:
        'before_after',
    },

    disableCase
  )
);


router.get(
  '/:id',
  validate(
    caseIdSchema
  ),
  asyncHandler(
    getCase
  )
);


export default router;
