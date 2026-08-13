import express from 'express';

import {
  getAuditLogs,
} from './audit.controller.js';

import {
  listAuditLogsSchema,
} from './audit.validation.js';

import auth from '../../middlewares/auth.js';

import authorize from '../../middlewares/authorize.js';

import validate from '../../middlewares/validate.js';

import asyncHandler from '../../utils/asyncHandler.js';


const router =
  express.Router();


router.get(
  '/',
  auth,
  authorize('admin'),
  validate(
    listAuditLogsSchema
  ),
  asyncHandler(
    getAuditLogs
  )
);


export default router;
