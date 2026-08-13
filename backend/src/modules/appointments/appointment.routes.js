import express from 'express';


import {
  createAppointment,
  getAppointments,
  getAppointment,
  updateStatus,
  cancelAppointment,
} from './appointment.controller.js';


import {
  createAppointmentSchema,
  appointmentIdSchema,
  updateStatusSchema,
  cancelAppointmentSchema,
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


export default router;
