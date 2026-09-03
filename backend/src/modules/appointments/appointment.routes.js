import express from 'express';


import {
  createAppointment,
  createAdminAppointment,
  rescheduleAppointment,
  getAppointments,
  getAppointment,
  getRescheduleAvailability,
  updateStatus,
  cancelAppointment,
} from './appointment.controller.js';


import {
  createAppointmentSchema,
  createAdminAppointmentSchema,
  appointmentIdSchema,
  updateStatusSchema,
  cancelAppointmentSchema,
  rescheduleAppointmentSchema,
  listAppointmentsSchema,
  rescheduleAvailabilitySchema,
} from './appointment.validation.js';


import auth from '../../middlewares/auth.js';

import authorize from '../../middlewares/authorize.js';

import validate from '../../middlewares/validate.js';

import {
  bookingLimiter,
} from '../../middlewares/rateLimiter.js';

import asyncHandler from '../../utils/asyncHandler.js';

import auditAction from '../audit/audit.middleware.js';
import noStore from '../../middlewares/noStore.js';


const router =
  express.Router();

router.use(noStore);


router.post(
  '/',
  bookingLimiter,
  validate(
    createAppointmentSchema
  ),
  auditAction(
    {
      action: (_req, _responseBody, res) => (
        res.locals.bookingIdempotencyReplay
          ? 'appointment.booking.replay'
          : 'appointment.create.website'
      ),

      entityType:
        'appointment',

      metadata:
        (req) => ({
          date:
            req.body.date,

          startTime:
            req.body.startTime,

          source:
            'website',
        }),
    },

    createAppointment
  )
);


router.post(
  '/admin',
  auth,
  authorize(
    'admin',
    'receptionist'
  ),
  validate(
    createAdminAppointmentSchema
  ),
  auditAction(
    {
      action:
        'appointment.create.admin',

      entityType:
        'appointment',

      metadata:
        (req) => ({
          date:
            req.body.date,

          startTime:
            req.body.startTime,

          source:
            req.body.source,
        }),
    },

    createAdminAppointment
  )
);


router.get(
  '/',
  auth,
  authorize(
    'admin',
    'receptionist'
  ),
  validate(
    listAppointmentsSchema
  ),
  asyncHandler(
    getAppointments
  )
);

router.get(
  '/:id/availability',
  auth,
  authorize(
    'admin',
    'receptionist'
  ),
  validate(
    rescheduleAvailabilitySchema
  ),
  asyncHandler(
    getRescheduleAvailability
  )
);


router.patch(
  '/:id/reschedule',
  auth,
  authorize(
    'admin',
    'receptionist'
  ),
  validate(
    rescheduleAppointmentSchema
  ),
  auditAction(
    {
      action:
        'appointment.reschedule',

      entityType:
        'appointment',

      metadata:
        (req) => ({
          date:
            req.body.date,

          startTime:
            req.body.startTime,
        }),
    },

    rescheduleAppointment
  )
);


router.patch(
  '/:id/status',
  auth,
  authorize(
    'admin',
    'receptionist'
  ),
  validate(
    updateStatusSchema
  ),
  auditAction(
    {
      action:
        'appointment.status.update',

      entityType:
        'appointment',

      metadata:
        (req) => ({
          status:
            req.body.status,
        }),
    },

    updateStatus
  )
);


router.post(
  '/:id/cancel',
  auth,
  authorize(
    'admin',
    'receptionist'
  ),
  validate(
    cancelAppointmentSchema
  ),
  auditAction(
    {
      action:
        'appointment.cancel',

      entityType:
        'appointment',
    },

    cancelAppointment
  )
);


router.get(
  '/:id',
  auth,
  authorize(
    'admin',
    'receptionist'
  ),
  validate(
    appointmentIdSchema
  ),
  asyncHandler(
    getAppointment
  )
);


export default router;
