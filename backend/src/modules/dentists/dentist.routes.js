import express from 'express';

import {
  createDentist,
  getDentists,
  getAdminDentists,
  getDentist,
  updateDentist,
  disableDentist,
  restoreDentist,
  setScheduleException,
  getScheduleExceptions,
  deleteScheduleException,
} from './dentist.controller.js';

import {
  createDentistSchema,
  updateDentistSchema,
  dentistIdSchema,
  listDentistsSchema,
  scheduleExceptionSchema,
  deleteScheduleExceptionSchema,
  listScheduleExceptionsSchema,
} from './dentist.validation.js';

import auth from '../../middlewares/auth.js';
import authorize from '../../middlewares/authorize.js';
import validate from '../../middlewares/validate.js';
import asyncHandler from '../../utils/asyncHandler.js';


const router = express.Router();


router.get(
  '/',
  validate(listDentistsSchema),
  asyncHandler(getDentists)
);


router.get(
  '/admin/all',
  auth,
  authorize('admin'),
  asyncHandler(getAdminDentists)
);


router.get(
  '/:id/schedule-exceptions',
  auth,
  authorize('admin'),
  validate(
    listScheduleExceptionsSchema
  ),
  asyncHandler(
    getScheduleExceptions
  )
);


router.put(
  '/:id/schedule-exceptions/:date',
  auth,
  authorize('admin'),
  validate(
    scheduleExceptionSchema
  ),
  asyncHandler(
    setScheduleException
  )
);


router.delete(
  '/:id/schedule-exceptions/:date',
  auth,
  authorize('admin'),
  validate(
    deleteScheduleExceptionSchema
  ),
  asyncHandler(
    deleteScheduleException
  )
);


router.post(
  '/',
  auth,
  authorize('admin'),
  validate(createDentistSchema),
  asyncHandler(createDentist)
);


router.patch(
  '/:id/restore',
  auth,
  authorize('admin'),
  validate(dentistIdSchema),
  asyncHandler(restoreDentist)
);


router.patch(
  '/:id',
  auth,
  authorize('admin'),
  validate(updateDentistSchema),
  asyncHandler(updateDentist)
);


router.delete(
  '/:id',
  auth,
  authorize('admin'),
  validate(dentistIdSchema),
  asyncHandler(disableDentist)
);


router.get(
  '/:slug',
  asyncHandler(getDentist)
);


export default router;
