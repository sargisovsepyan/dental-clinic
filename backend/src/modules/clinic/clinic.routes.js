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
import validate from '../../middlewares/validate.js';
import asyncHandler from '../../utils/asyncHandler.js';


const router = express.Router();


router.get(
  '/',
  asyncHandler(getClinic)
);


router.patch(
  '/',
  auth,
  authorize('admin'),
  validate(
    updateClinicSchema
  ),
  asyncHandler(
    updateClinic
  )
);


router.get(
  '/closures',
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
  auth,
  authorize('admin'),
  validate(
    closureSchema
  ),
  asyncHandler(
    setClosure
  )
);


router.delete(
  '/closures/:date',
  auth,
  authorize('admin'),
  validate(
    closureDateSchema
  ),
  asyncHandler(
    deleteClosure
  )
);


export default router;
