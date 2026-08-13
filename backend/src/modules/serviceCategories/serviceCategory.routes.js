import express from 'express';

import {
  createCategory,
  getCategories,
  getAdminCategories,
  getCategory,
  updateCategory,
  deleteCategory,
  restoreCategory,
} from './serviceCategory.controller.js';

import {
  createCategorySchema,
  updateCategorySchema,
  categoryIdSchema,
} from './serviceCategory.validation.js';

import auth from '../../middlewares/auth.js';
import authorize from '../../middlewares/authorize.js';
import validate from '../../middlewares/validate.js';
import asyncHandler from '../../utils/asyncHandler.js';

import auditAction from '../audit/audit.middleware.js';


const router =
  express.Router();


router.get(
  '/',
  asyncHandler(
    getCategories
  )
);


router.get(
  '/admin/all',
  auth,
  authorize('admin'),
  asyncHandler(
    getAdminCategories
  )
);


router.post(
  '/',
  auth,
  authorize('admin'),
  validate(
    createCategorySchema
  ),
  auditAction(
    {
      action:
        'service_category.create',

      entityType:
        'service_category',

      metadata:
        (req) => ({
          name:
            req.body.name,
        }),
    },

    createCategory
  )
);


router.patch(
  '/:id/restore',
  auth,
  authorize('admin'),
  validate(
    categoryIdSchema
  ),
  auditAction(
    {
      action:
        'service_category.restore',

      entityType:
        'service_category',
    },

    restoreCategory
  )
);


router.patch(
  '/:id',
  auth,
  authorize('admin'),
  validate(
    updateCategorySchema
  ),
  auditAction(
    {
      action:
        'service_category.update',

      entityType:
        'service_category',
    },

    updateCategory
  )
);


router.delete(
  '/:id',
  auth,
  authorize('admin'),
  validate(
    categoryIdSchema
  ),
  auditAction(
    {
      action:
        'service_category.disable',

      entityType:
        'service_category',
    },

    deleteCategory
  )
);


router.get(
  '/:slug',
  asyncHandler(
    getCategory
  )
);


export default router;
