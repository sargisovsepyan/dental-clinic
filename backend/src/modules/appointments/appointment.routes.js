import express from 'express';


import {
  createAppointment,
  createAdminAppointment,
  rescheduleAppointment,
  getAppointments,
  getAppointment,
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
} from './appointment.validation.js';


import auth from '../../middlewares/auth.js';

import authorize from '../../middlewares/authorize.js';

import validate from '../../middlewares/validate.js';

import {
  bookingLimiter,
} from '../../middlewares/rateLimiter.js';

import asyncHandler from '../../utils/asyncHandler.js';


const router =
  express.Router();


router.post(
  '/',
  bookingLimiter,
  validate(
    createAppointmentSchema
  ),
  asyncHandler(
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
  asyncHandler(
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
  asyncHandler(
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
  asyncHandler(
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
  asyncHandler(
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
