import User from '../users/user.model.js';
import Session from '../sessions/session.model.js';
import AdminInvariant from './adminInvariant.model.js';

import ApiError from '../../utils/ApiError.js';
import runTransaction from '../../utils/runTransaction.js';
import env from '../../config/env.js';
import {
  issueOneTimeToken,
} from '../auth/auth.service.js';
import {
  sendStaffInvitation,
} from '../../mail/mail.service.js';

const publicFields =
  'name email role isActive isSetupComplete invitedBy deactivatedAt deactivatedBy createdAt updatedAt';

const safeStaff = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  isActive: user.isActive,
  isSetupComplete: user.isSetupComplete,
  invitedBy: user.invitedBy,
  deactivatedAt: user.deactivatedAt,
  deactivatedBy: user.deactivatedBy,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const listStaff = async (query) => {
  const filter = {};

  if (query.role) {
    filter.role = query.role;
  }
  if (query.isActive !== undefined) {
    filter.isActive = query.isActive;
  }
  if (query.setupComplete !== undefined) {
    filter.isSetupComplete = query.setupComplete;
  }

  const skip = (query.page - 1) * query.limit;
  const [staff, total] = await Promise.all([
    User.find(filter)
      .select(publicFields)
      .sort({ name: 1, _id: 1 })
      .skip(skip)
      .limit(query.limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  return {
    staff,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.ceil(total / query.limit),
    },
  };
};

const getStaffById = async (id) => {
  const user = await User.findById(id)
    .select(publicFields)
    .lean();

  if (!user) {
    throw new ApiError(404, 'Staff member not found');
  }

  return user;
};

const inviteStaff = async (data, actorId) => {
  const email = data.email.trim().toLowerCase();
  let user = await User.findOne({ email })
    .select(publicFields);

  if (user?.isSetupComplete) {
    throw new ApiError(
      409,
      'A staff account with this email already exists'
    );
  }

  if (!user) {
    user = await User.create({
      name: data.name,
      email,
      role: data.role,
      isActive: false,
      isSetupComplete: false,
      invitedBy: actorId,
    });
  }

  const token = await issueOneTimeToken({
    user,
    purpose: 'invite',
    createdBy: actorId,
    ttlMinutes: env.INVITE_TOKEN_TTL_MINUTES,
  });

  await sendStaffInvitation({
    email: user.email,
    token,
  });

  return getStaffById(user._id);
};

const touchAdminInvariant = (session) => (
  AdminInvariant.updateOne(
    { _id: 'active-admin-invariant' },
    {
      $inc: { revision: 1 },
      $setOnInsert: {
        _id: 'active-admin-invariant',
      },
    },
    { upsert: true, session }
  )
);

const ensureNotLastAdmin = async (
  user,
  session
) => {
  if (
    user.role !== 'admin' ||
    !user.isActive ||
    user.isSetupComplete === false
  ) {
    return;
  }

  await touchAdminInvariant(session);

  const activeAdmins = await User.countDocuments({
    role: 'admin',
    isActive: true,
    isSetupComplete: { $ne: false },
  }).session(session);

  if (activeAdmins <= 1) {
    throw new ApiError(
      409,
      'The last active administrator cannot be removed or demoted'
    );
  }
};

const revokeSessionsInTransaction = (
  userId,
  session
) => Session.updateMany(
  { user: userId, revokedAt: null },
  { $set: { revokedAt: new Date() } },
  { session }
);

const updateStaffRole = async (
  id,
  role,
  actorId
) => runTransaction(async (session) => {
  const user = await User.findById(id)
    .select('+authVersion')
    .session(session);

  if (!user) {
    throw new ApiError(404, 'Staff member not found');
  }
  if (String(user._id) === String(actorId)) {
    throw new ApiError(
      409,
      'Administrators cannot change their own role'
    );
  }
  if (user.role === role) {
    return safeStaff(user);
  }
  if (user.role === 'admin' && role !== 'admin') {
    await ensureNotLastAdmin(user, session);
  }

  user.role = role;
  user.authVersion += 1;
  await user.save({ session });
  await revokeSessionsInTransaction(user._id, session);
  return safeStaff(user);
});

const deactivateStaff = async (
  id,
  actorId
) => runTransaction(async (session) => {
  const user = await User.findById(id)
    .select('+authVersion')
    .session(session);

  if (!user) {
    throw new ApiError(404, 'Staff member not found');
  }
  if (String(user._id) === String(actorId)) {
    throw new ApiError(
      409,
      'Administrators cannot deactivate themselves'
    );
  }
  if (!user.isActive) {
    return safeStaff(user);
  }

  await ensureNotLastAdmin(user, session);
  user.isActive = false;
  user.deactivatedAt = new Date();
  user.deactivatedBy = actorId;
  user.authVersion += 1;
  await user.save({ session });
  await revokeSessionsInTransaction(user._id, session);
  return safeStaff(user);
});

const reactivateStaff = async (id) => (
  runTransaction(async (session) => {
    const user = await User.findById(id)
      .select('+authVersion')
      .session(session);

    if (!user) {
      throw new ApiError(404, 'Staff member not found');
    }
    if (!user.isSetupComplete) {
      throw new ApiError(
        409,
        'Invited staff must complete account setup first'
      );
    }

    user.isActive = true;
    user.deactivatedAt = null;
    user.deactivatedBy = null;
    user.authVersion += 1;
    await user.save({ session });
    await revokeSessionsInTransaction(user._id, session);
    return safeStaff(user);
  })
);

const revokeAllStaffSessions = async (id) => (
  runTransaction(async (session) => {
    const user = await User.findById(id)
      .select('+authVersion')
      .session(session);

    if (!user) {
      throw new ApiError(404, 'Staff member not found');
    }

    user.authVersion += 1;
    await user.save({ session });
    await revokeSessionsInTransaction(user._id, session);
    return safeStaff(user);
  })
);

export {
  listStaff,
  getStaffById,
  inviteStaff,
  updateStaffRole,
  deactivateStaff,
  reactivateStaff,
  revokeAllStaffSessions,
};
