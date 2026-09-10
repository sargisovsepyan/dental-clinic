import express from 'express';

import {
  createService,
  getServices,
  getAdminServices,
  getService,
  updateService,
  deleteService,
  restoreService,
} from './service.controller.js';

import {
  createServiceSchema,
  updateServiceSchema,
  serviceIdSchema,
  listServiceSchema,
} from './service.validation.js';

import auth from '../../middlewares/auth.js';
import authorize from '../../middlewares/authorize.js';
import noStore from '../../middlewares/noStore.js';
import validate from '../../middlewares/validate.js';
import asyncHandler from '../../utils/asyncHandler.js';

import auditAction from '../audit/audit.middleware.js';


const router =
  express.Router();


router.get(
  '/',
  validate(
    listServiceSchema
  ),
  asyncHandler(
    getServices
  )
);


router.get(
  '/admin/all',
  noStore,
  auth,
  authorize('admin'),
  asyncHandler(
    getAdminServices
  )
);


router.post(
  '/',
  noStore,
  auth,
  authorize('admin'),
  validate(
    createServiceSchema
  ),
  auditAction(
    {
      action:
        'service.create',

      entityType:
        'service',

      metadata:
        (req) => ({
          name:
            req.body.name,

          category:
            req.body.category,
        }),
    },

    createService
  )
);


router.patch(
  '/:id/restore',
  noStore,
  auth,
  authorize('admin'),
  validate(
    serviceIdSchema
  ),
  auditAction(
    {
      action:
        'service.restore',

      entityType:
        'service',
    },

    restoreService
  )
);


router.patch(
  '/:id',
  noStore,
  auth,
  authorize('admin'),
  validate(
    updateServiceSchema
  ),
  auditAction(
    {
      action:
        'service.update',

      entityType:
        'service',
    },

    updateService
  )
);


router.delete(
  '/:id',
  noStore,
  auth,
  authorize('admin'),
  validate(
    serviceIdSchema
  ),
  auditAction(
    {
      action:
        'service.disable',

      entityType:
        'service',
    },

    deleteService
  )
);


router.get(
  '/:slug',
  asyncHandler(
    getService
  )
);


export default router;
