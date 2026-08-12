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
import validate from '../../middlewares/validate.js';
import asyncHandler from '../../utils/asyncHandler.js';

const router = express.Router();

router.get(
  '/',
  validate(listServiceSchema),
  asyncHandler(getServices)
);

router.get(
  '/admin/all',
  auth,
  authorize('admin'),
  asyncHandler(getAdminServices)
);

router.get(
  '/:slug',
  asyncHandler(getService)
);

router.post(
  '/',
  auth,
  authorize('admin'),
  validate(createServiceSchema),
  asyncHandler(createService)
);

router.patch(
  '/:id',
  auth,
  authorize('admin'),
  validate(updateServiceSchema),
  asyncHandler(updateService)
);

router.delete(
  '/:id',
  auth,
  authorize('admin'),
  validate(serviceIdSchema),
  asyncHandler(deleteService)
);

router.patch(
  '/:id/restore',
  auth,
  authorize('admin'),
  validate(serviceIdSchema),
  asyncHandler(restoreService)
);

export default router;
