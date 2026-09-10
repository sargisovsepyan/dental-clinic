import express from 'express';

import {
  getClinic,
  updateClinic,
  getClosures,
  setClosure,
  deleteClosure,
} from './clinic.controller.js';

import {
  updateClinicSchema,
  closureSchema,
  closureDateSchema,
  listClosuresSchema,
} from './clinic.validation.js';

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
  asyncHandler(
    getClinic
  )
);


router.patch(
  '/',
  noStore,
  auth,
  authorize('admin'),
  validate(
    updateClinicSchema
  ),
  auditAction(
    {
      action:
        'clinic.settings.update',

      entityType:
        'clinic',
    },

    updateClinic
  )
);


router.get(
  '/closures',
  noStore,
  auth,
  authorize('admin'),
  validate(
    listClosuresSchema
  ),
  asyncHandler(
    getClosures
  )
);


router.put(
  '/closures/:date',
  noStore,
  auth,
  authorize('admin'),
  validate(
    closureSchema
  ),
  auditAction(
    {
      action:
        'clinic.schedule_exception.set',

      entityType:
        'clinic_schedule',

      metadata:
        (req) => ({
          date:
            req.params.date,

          isOpen:
            req.body.isOpen,
        }),
    },

    setClosure
  )
);


router.delete(
  '/closures/:date',
  noStore,
  auth,
  authorize('admin'),
  validate(
    closureDateSchema
  ),
  auditAction(
    {
      action:
        'clinic.schedule_exception.delete',

      entityType:
        'clinic_schedule',

      metadata:
        (req) => ({
          date:
            req.params.date,
        }),
    },

    deleteClosure
  )
);


export default router;
