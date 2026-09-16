import express from 'express';

import {
  getAuditLogs,
} from './audit.controller.js';

import {
  listAuditLogsSchema,
} from './audit.validation.js';

import auth from '../../middlewares/auth.js';

import authorize from '../../middlewares/authorize.js';

import noStore from '../../middlewares/noStore.js';

import validate from '../../middlewares/validate.js';

import asyncHandler from '../../utils/asyncHandler.js';


const router =
  express.Router();


router.use(
  noStore,
  auth,
  authorize('admin')
);


router.get(
  '/',
  validate(
    listAuditLogsSchema
  ),
  asyncHandler(
    getAuditLogs
  )
);


export default router;
