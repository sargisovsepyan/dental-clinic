import User from '../users/user.model.js';
import Session from '../sessions/session.model.js';
import OneTimeToken from '../auth/oneTimeToken.model.js';
import AdminInvariant from './adminInvariant.model.js';
import Dentist from '../dentists/dentist.model.js';

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
  'name nameTranslations email role isActive isSetupComplete +dentistProfile invitedBy deactivatedAt deactivatedBy createdAt updatedAt';

const safeStaff = (user) => ({
  _id: user._id,
  name: user.name,
  ...(user.nameTranslations ? { nameTranslations: user.nameTranslations } : {}),
  email: user.email,
  role: user.role,
  dentistProfile: user.dentistProfile || null,
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
  const lifecycleFilters = {
    current: { deactivatedAt: null, $or: [{ isActive: true }, { isSetupComplete: false }] },
    active: { isActive: true, isSetupComplete: true, deactivatedAt: null },
    pending: { isSetupComplete: false, deactivatedAt: null },
    deactivated: { $or: [{ deactivatedAt: { $ne: null } }, { isActive: false, isSetupComplete: true }] }, all: {},
  };
  if (query.lifecycle) Object.assign(filter, lifecycleFilters[query.lifecycle]);

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
    staff: staff.map(safeStaff),
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

  return safeStaff(user);
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

  if (user && (
    user.role !== data.role ||
    String(user.dentistProfile || '') !== String(data.dentistProfileId || '')
  )) {
    throw new ApiError(
      409,
      'A pending invitation already exists with different account details'
    );
  }

  if (data.role === 'dentist') {
    if (!await Dentist.exists({ _id: data.dentistProfileId })) {
      throw new ApiError(400, 'Select an existing dentist profile');
    }
    const linked = await User.exists({
      dentistProfile: data.dentistProfileId,
      deactivatedAt: null,
      ...(user ? { _id: { $ne: user._id } } : {}),
    });
    if (linked) {
      throw new ApiError(409, 'This dentist profile already has current staff access');
    }
  }

  if (!user) {
    try {
      user = await User.create({
        name: data.name,
        email,
        role: data.role,
        dentistProfile: data.role === 'dentist' ? data.dentistProfileId : null,
        isActive: false,
        isSetupComplete: false,
        invitedBy: actorId,
      });
    }
    catch (error) {
      if (error?.code === 11000) {
        throw new ApiError(409, 'This email or dentist profile already has current staff access');
      }
      throw error;
    }
  }
  else {
    try {
      user = await User.findOneAndUpdate(
        {
          _id: user._id,
          isSetupComplete: false,
        },
        {
          $set: {
            deactivatedAt: null,
            deactivatedBy: null,
            invitedBy: actorId,
          },
        },
        { returnDocument: 'after' }
      );
    }
    catch (error) {
      if (error?.code === 11000) {
        throw new ApiError(409, 'This dentist profile already has current staff access');
      }
      throw error;
    }

    if (!user) {
      throw new ApiError(
        409,
        'A staff account with this email already exists'
      );
    }
  }

  const token = await issueOneTimeToken({
    user,
    purpose: 'invite',
    createdBy: actorId,
    ttlMinutes: env.INVITE_TOKEN_TTL_MINUTES,
    requirePendingInvitation: true,
  });

  await sendStaffInvitation({
    email: user.email,
    token,
  });

  return getStaffById(user._id);
};

// Deliberate identity-bound action. Never replay after an uncertain mail result.
export const resendStaffInvitation = async (id, actorId) => {
  const user = await User.findById(id).select(publicFields);
  if (!user) throw new ApiError(404, 'Staff member not found');
  if (user.isSetupComplete || user.deactivatedAt) throw new ApiError(409, 'Invitation is no longer pending');
  const token = await issueOneTimeToken({ user, purpose: 'invite', createdBy: actorId,
    ttlMinutes: env.INVITE_TOKEN_TTL_MINUTES, requirePendingInvitation: true });
  await sendStaffInvitation({ email: user.email, token });
  return getStaffById(id);
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


const consumeOutstandingOneTimeTokens = (
  userId,
  session
) => OneTimeToken.updateMany(
  {
    user: userId,
    consumedAt: null,
  },
  { $set: { consumedAt: new Date() } },
  { session }
);

const updateStaffRole = async (
  id,
  role,
  actorId,
  dentistProfileId = null
) => runTransaction(async (session) => {
  const user = await User.findById(id)
    .select('+authVersion +dentistProfile')
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

  if (role === 'dentist') {
    const requestedProfile = dentistProfileId || user.dentistProfile;
    if (!requestedProfile || !await Dentist.exists({ _id: requestedProfile }).session(session)) {
      throw new ApiError(409, 'A dentist role requires an existing dentist profile');
    }
    const linked = await User.exists({
      _id: { $ne: user._id },
      dentistProfile: requestedProfile,
      deactivatedAt: null,
    }).session(session);
    if (linked) {
      throw new ApiError(409, 'This dentist profile already has current staff access');
    }
    user.dentistProfile = requestedProfile;
  }
  else {
    user.dentistProfile = null;
  }

  user.role = role;
  user.authVersion += 1;
  try {
    await user.save({ session });
  }
  catch (error) {
    if (error?.code === 11000) {
      throw new ApiError(409, 'This dentist profile already has current staff access');
    }
    throw error;
  }
  await revokeSessionsInTransaction(user._id, session);
  return safeStaff(user);
});

const deactivateStaff = async (
  id,
  actorId
) => runTransaction(async (session) => {
  const user = await User.findById(id)
    .select('+authVersion +dentistProfile')
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
  if (!user.isSetupComplete) {
    throw new ApiError(409, 'Pending invitations must be cancelled explicitly');
  }
  await ensureNotLastAdmin(user, session);
  await revokeSessionsInTransaction(user._id, session);
  await consumeOutstandingOneTimeTokens(user._id, session);

  if (!user.isActive && user.deactivatedAt) {
    return safeStaff(user);
  }

  user.isActive = false;
  user.deactivatedAt = new Date();
  user.deactivatedBy = actorId;
  user.authVersion += 1;
  await user.save({ session });
  return safeStaff(user);
});

const cancelStaffInvitation = async (
  id,
  actorId
) => runTransaction(async (session) => {
  const user = await User.findById(id)
    .select('+authVersion +dentistProfile')
    .session(session);

  if (!user) throw new ApiError(404, 'Staff member not found');
  if (user.isSetupComplete || user.deactivatedAt) {
    throw new ApiError(409, 'Invitation is no longer pending');
  }

  await revokeSessionsInTransaction(user._id, session);
  await consumeOutstandingOneTimeTokens(user._id, session);
  user.isActive = false;
  user.deactivatedAt = new Date();
  user.deactivatedBy = actorId;
  user.authVersion += 1;
  await user.save({ session });
  return safeStaff(user);
});

const reactivateStaff = async (id) => (
  runTransaction(async (session) => {
    const user = await User.findById(id)
      .select('+authVersion +dentistProfile')
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
    if (user.dentistProfile && await User.exists({
      _id: { $ne: user._id },
      dentistProfile: user.dentistProfile,
      deactivatedAt: null,
    }).session(session)) {
      throw new ApiError(409, 'This dentist profile already has current staff access');
    }

    user.isActive = true;
    user.deactivatedAt = null;
    user.deactivatedBy = null;
    user.authVersion += 1;
    try {
      await user.save({ session });
    }
    catch (error) {
      if (error?.code === 11000) {
        throw new ApiError(409, 'This dentist profile already has current staff access');
      }
      throw error;
    }
    await revokeSessionsInTransaction(user._id, session);
    return safeStaff(user);
  })
);

const revokeAllStaffSessions = async (id) => (
  runTransaction(async (session) => {
    const user = await User.findById(id)
      .select('+authVersion +dentistProfile')
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

const getDentistProfile = async (id) => {
  const user = await User.findById(id).select('+dentistProfile').lean();
  if (!user) throw new ApiError(404, 'Staff member not found');
  return { dentistId: user.dentistProfile || null };
};

const setDentistProfile = async (id, dentistId) => runTransaction(async (session) => {
  const user = await User.findById(id).select('+dentistProfile +authVersion').session(session);
  if (!user) throw new ApiError(404, 'Staff member not found');
  if (user.role !== 'dentist') throw new ApiError(409, 'Only dentist accounts can have a doctor profile');
  if (!await Dentist.exists({ _id: dentistId }).session(session)) {
    throw new ApiError(400, 'Select an existing dentist profile');
  }
  const linked = await User.exists({
    _id: { $ne: user._id },
    dentistProfile: dentistId,
    deactivatedAt: null,
  }).session(session);
  if (linked) {
    throw new ApiError(409, 'This dentist profile already has current staff access');
  }
  user.dentistProfile = dentistId;
  user.authVersion += 1;
  try {
    await user.save({ session });
  }
  catch (error) {
    if (error?.code === 11000) {
      throw new ApiError(409, 'This dentist profile already has current staff access');
    }
    throw error;
  }
  await revokeSessionsInTransaction(user._id, session);
  return { dentistId: user.dentistProfile || null };
});

export {
  getDentistProfile,
  setDentistProfile,
  listStaff,
  getStaffById,
  inviteStaff,
  updateStaffRole,
  deactivateStaff,
  cancelStaffInvitation,
  reactivateStaff,
  revokeAllStaffSessions,
};
