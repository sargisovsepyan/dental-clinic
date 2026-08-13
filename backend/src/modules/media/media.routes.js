import express from 'express';


import {
  uploadDentistPhoto,
  deleteDentistPhoto,
  uploadServiceImage,
  deleteServiceImage,
  createGalleryImage,
  getGallery,
  getAdminGallery,
  updateGalleryImage,
  deleteGalleryImage,
  restoreGalleryImage,
} from './media.controller.js';


import {
  entityIdSchema,
  createGallerySchema,
  updateGallerySchema,
} from './media.validation.js';


import auth from '../../middlewares/auth.js';

import authorize from '../../middlewares/authorize.js';

import validate from '../../middlewares/validate.js';

import {
  handleImageUpload,
  verifyImageSignature,
} from '../../middlewares/uploadImage.js';

import {
  mediaUploadLimiter,
} from '../../middlewares/rateLimiter.js';

import asyncHandler from '../../utils/asyncHandler.js';

import auditAction from '../audit/audit.middleware.js';


const router =
  express.Router();


router.get(
  '/gallery',
  asyncHandler(
    getGallery
  )
);


router.get(
  '/gallery/admin',
  auth,
  authorize('admin'),
  asyncHandler(
    getAdminGallery
  )
);


router.post(
  '/gallery',
  auth,
  authorize('admin'),

  mediaUploadLimiter,

  handleImageUpload,
  verifyImageSignature,

  validate(
    createGallerySchema
  ),

  auditAction(
    {
      action:
        'media.gallery.create',

      entityType:
        'media',
    },

    createGalleryImage
  )
);


router.patch(
  '/gallery/:id/restore',
  auth,
  authorize('admin'),

  validate(
    entityIdSchema
  ),

  auditAction(
    {
      action:
        'media.gallery.restore',

      entityType:
        'media',
    },

    restoreGalleryImage
  )
);


router.patch(
  '/gallery/:id',
  auth,
  authorize('admin'),

  validate(
    updateGallerySchema
  ),

  auditAction(
    {
      action:
        'media.gallery.update',

      entityType:
        'media',
    },

    updateGalleryImage
  )
);


router.delete(
  '/gallery/:id',
  auth,
  authorize('admin'),

  validate(
    entityIdSchema
  ),

  auditAction(
    {
      action:
        'media.gallery.delete',

      entityType:
        'media',
    },

    deleteGalleryImage
  )
);


router.put(
  '/dentists/:id/photo',
  auth,
  authorize('admin'),

  validate(
    entityIdSchema
  ),

  mediaUploadLimiter,

  handleImageUpload,
  verifyImageSignature,

  auditAction(
    {
      action:
        'dentist.photo.update',

      entityType:
        'dentist',
    },

    uploadDentistPhoto
  )
);


router.delete(
  '/dentists/:id/photo',
  auth,
  authorize('admin'),

  validate(
    entityIdSchema
  ),

  auditAction(
    {
      action:
        'dentist.photo.delete',

      entityType:
        'dentist',
    },

    deleteDentistPhoto
  )
);


router.put(
  '/services/:id/image',
  auth,
  authorize('admin'),

  validate(
    entityIdSchema
  ),

  mediaUploadLimiter,

  handleImageUpload,
  verifyImageSignature,

  auditAction(
    {
      action:
        'service.image.update',

      entityType:
        'service',
    },

    uploadServiceImage
  )
);


router.delete(
  '/services/:id/image',
  auth,
  authorize('admin'),

  validate(
    entityIdSchema
  ),

  auditAction(
    {
      action:
        'service.image.delete',

      entityType:
        'service',
    },

    deleteServiceImage
  )
);


export default router;

