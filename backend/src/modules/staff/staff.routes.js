import express from 'express';

import {
  listStaff,
  getStaff,
  inviteStaff,
  updateRole,
  deactivate,
  reactivate,
  revokeSessions,
} from './staff.controller.js';
import {
  inviteStaffSchema,
  staffIdSchema,
  updateRoleSchema,
  listStaffSchema,
} from './staff.validation.js';

import auth from '../../middlewares/auth.js';
import authorize from '../../middlewares/authorize.js';
import validate from '../../middlewares/validate.js';
import asyncHandler from '../../utils/asyncHandler.js';
import auditAction from '../audit/audit.middleware.js';

const router = express.Router();

router.use(auth, authorize('admin'));

router.get(
  '/',
  validate(listStaffSchema),
  asyncHandler(listStaff)
);

router.post(
  '/invite',
  validate(inviteStaffSchema),
  auditAction(
    {
      action: 'staff.invited',
      entityType: 'user',
    },
    inviteStaff
  )
);

router.get(
  '/:id',
  validate(staffIdSchema),
  asyncHandler(getStaff)
);

router.patch(
  '/:id/role',
  validate(updateRoleSchema),
  auditAction(
    {
      action: 'staff.role.updated',
      entityType: 'user',
      metadata: (req) => ({ role: req.body.role }),
    },
    updateRole
  )
);

router.post(
  '/:id/deactivate',
  validate(staffIdSchema),
  auditAction(
    {
      action: 'staff.deactivated',
      entityType: 'user',
    },
    deactivate
  )
);

router.post(
  '/:id/reactivate',
  validate(staffIdSchema),
  auditAction(
    {
      action: 'staff.reactivated',
      entityType: 'user',
    },
    reactivate
  )
);

router.post(
  '/:id/revoke-sessions',
  validate(staffIdSchema),
  auditAction(
    {
      action: 'staff.sessions.revoked',
      entityType: 'user',
    },
    revokeSessions
  )
);

export default router;
