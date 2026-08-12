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

const router = express.Router();

router.get(
  '/',
  asyncHandler(getCategories)
);

router.get(
  '/admin/all',
  auth,
  authorize('admin'),
  asyncHandler(getAdminCategories)
);

router.get(
  '/:slug',
  asyncHandler(getCategory)
);

router.post(
  '/',
  auth,
  authorize('admin'),
  validate(createCategorySchema),
  asyncHandler(createCategory)
);

router.patch(
  '/:id',
  auth,
  authorize('admin'),
  validate(updateCategorySchema),
  asyncHandler(updateCategory)
);

router.delete(
  '/:id',
  auth,
  authorize('admin'),
  validate(categoryIdSchema),
  asyncHandler(deleteCategory)
);

router.patch(
  '/:id/restore',
  auth,
  authorize('admin'),
  validate(categoryIdSchema),
  asyncHandler(restoreCategory)
);

export default router;
