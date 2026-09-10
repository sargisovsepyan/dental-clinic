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
import noStore from '../../middlewares/noStore.js';
import validate from '../../middlewares/validate.js';
import asyncHandler from '../../utils/asyncHandler.js';

import auditAction from '../audit/audit.middleware.js';


const router =
  express.Router();


router.get(
  '/',
  validate(
    listDentistsSchema
  ),
  asyncHandler(
    getDentists
  )
);


router.get(
  '/admin/all',
  noStore,
  auth,
  authorize('admin'),
  asyncHandler(
    getAdminDentists
  )
);


router.get(
  '/:id/schedule-exceptions',
  noStore,
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
  noStore,
  auth,
  authorize('admin'),
  validate(
    scheduleExceptionSchema
  ),
  auditAction(
    {
      action:
        'dentist.schedule_exception.set',

      entityType:
        'dentist_schedule',

      metadata:
        (req) => ({
          date:
            req.params.date,

          isWorking:
            req.body.isWorking,
        }),
    },

    setScheduleException
  )
);


router.delete(
  '/:id/schedule-exceptions/:date',
  noStore,
  auth,
  authorize('admin'),
  validate(
    deleteScheduleExceptionSchema
  ),
  auditAction(
    {
      action:
        'dentist.schedule_exception.delete',

      entityType:
        'dentist_schedule',

      metadata:
        (req) => ({
          date:
            req.params.date,
        }),
    },

    deleteScheduleException
  )
);


router.post(
  '/',
  noStore,
  auth,
  authorize('admin'),
  validate(
    createDentistSchema
  ),
  auditAction(
    {
      action:
        'dentist.create',

      entityType:
        'dentist',

      metadata:
        (req) => ({
          firstName:
            req.body.firstName,

          lastName:
            req.body.lastName,
        }),
    },

    createDentist
  )
);


router.patch(
  '/:id/restore',
  noStore,
  auth,
  authorize('admin'),
  validate(
    dentistIdSchema
  ),
  auditAction(
    {
      action:
        'dentist.restore',

      entityType:
        'dentist',
    },

    restoreDentist
  )
);


router.patch(
  '/:id',
  noStore,
  auth,
  authorize('admin'),
  validate(
    updateDentistSchema
  ),
  auditAction(
    {
      action:
        'dentist.update',

      entityType:
        'dentist',
    },

    updateDentist
  )
);


router.delete(
  '/:id',
  noStore,
  auth,
  authorize('admin'),
  validate(
    dentistIdSchema
  ),
  auditAction(
    {
      action:
        'dentist.disable',

      entityType:
        'dentist',
    },

    disableDentist
  )
);


router.get(
  '/:slug',
  asyncHandler(
    getDentist
  )
);


export default router;
