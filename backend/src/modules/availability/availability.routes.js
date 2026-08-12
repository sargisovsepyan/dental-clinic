import express from 'express';

import {
  getAvailability,
} from './availability.controller.js';

import {
  availabilitySchema,
} from './availability.validation.js';

import validate from '../../middlewares/validate.js';

import asyncHandler from '../../utils/asyncHandler.js';


const router =
  express.Router();


router.get(
  '/',
  validate(
    availabilitySchema
  ),
  asyncHandler(
    getAvailability
  )
);


export default router;
