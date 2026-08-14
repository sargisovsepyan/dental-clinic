import crypto from 'crypto';

import User from '../users/user.model.js';
import Session from '../sessions/session.model.js';
import OneTimeToken from './oneTimeToken.model.js';

import ApiError from '../../utils/ApiError.js';
import generateToken from '../../utils/generateToken.js';
import runTransaction from '../../utils/runTransaction.js';
import env from '../../config/env.js';
import {
  generateOneTimeToken,
  hashOneTimeToken,
  getTokenExpiry,
} from '../../utils/oneTimeToken.js';
import {
  generateRefreshToken,
  hashToken,
  getRefreshTokenExpiry,
} from '../../utils/refreshToken.js';
import {
  sendPasswordReset,
} from '../../mail/mail.service.js';
import {
  logAuditEvent,
} from '../audit/audit.service.js';
import logger from '../../observability/logger.js';

const formatUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  isActive: user.isActive,
  isSetupComplete:
    user.isSetupComplete !== false,
});

const revokeUserSecurity = async (
  userId,
  session = null
) => {
  const now = new Date();

  await Session.updateMany(
    { user: userId, revokedAt: null },
    { $set: { revokedAt: now } },
    { session }
  );
  await User.updateOne(
    { _id: userId },
    { $inc: { authVersion: 1 } },
    { session }
  );
};

const login = async (
  email,
  password,
  userAgent = ''
) => {
  const normalizedEmail = email
    .trim()
    .toLowerCase();

  const user = await User.findOne({
    email: normalizedEmail,
    isActive: true,
    isSetupComplete: { $ne: false },
  }).select('+password +authVersion');

  if (!user) {
    throw new ApiError(
      401,
      'Invalid email or password'
    );
  }

  const passwordIsCorrect =
    await user.comparePassword(password);

  if (!passwordIsCorrect) {
    throw new ApiError(
      401,
      'Invalid email or password'
    );
  }

  const accessToken = generateToken(user);
  const refreshToken = generateRefreshToken();

  await Session.create({
    user: user._id,
    familyId: crypto.randomUUID(),
    tokenHash: hashToken(refreshToken),
    expiresAt: getRefreshTokenExpiry(),
    userAgent,
  });

  const activeSessions = await Session.find({
    user: user._id,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  })
    .sort({ createdAt: -1 })
    .select('_id')
    .lean();

  if (activeSessions.length > 5) {
    await Session.updateMany(
      {
        _id: {
          $in: activeSessions
            .slice(5)
            .map(({ _id }) => _id),
        },
      },
      { $set: { revokedAt: new Date() } }
    );
  }

  return {
    accessToken,
    refreshToken,
    user: formatUser(user),
  };
};

const handleRefreshReuse = async (
  tokenHash,
  req
) => {
  const reused = await Session.findOne({
    consumedTokenHashes: tokenHash,
  }).select('user familyId');

  if (!reused) {
    return false;
  }

  await runTransaction((session) =>
    revokeUserSecurity(reused.user, session)
  );

  if (req) {
    await logAuditEvent({
      req,
      actorId: reused.user,
      action: 'auth.refresh.reuse_detected',
      entityType: 'session_family',
      entityId: reused.familyId,
      metadata: {
        response: 'user_sessions_revoked',
      },
    });
  }

  return true;
};

const refresh = async (
  currentRefreshToken,
  req = null
) => {
  if (!currentRefreshToken) {
    throw new ApiError(
      401,
      'Refresh token is missing'
    );
  }

  const tokenHash = hashToken(currentRefreshToken);
  const nextRefreshToken = generateRefreshToken();

  const session = await Session.findOneAndUpdate(
    {
      tokenHash,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    },
    {
      $set: {
        tokenHash: hashToken(nextRefreshToken),
        expiresAt: getRefreshTokenExpiry(),
      },
      $push: {
        consumedTokenHashes: tokenHash,
      },
    },
    { returnDocument: 'after' }
  ).populate({
    path: 'user',
    select: '+authVersion',
  });

  if (!session) {
    await handleRefreshReuse(tokenHash, req);

    throw new ApiError(
      401,
      'Invalid or expired session'
    );
  }

  if (
    !session.user ||
    !session.user.isActive ||
    session.user.isSetupComplete === false
  ) {
    await Session.updateOne(
      { _id: session._id },
      { $set: { revokedAt: new Date() } }
    );

    throw new ApiError(
      401,
      'Invalid or expired session'
    );
  }

  return {
    accessToken: generateToken(session.user),
    refreshToken: nextRefreshToken,
    user: formatUser(session.user),
  };
};

const logout = async (currentRefreshToken) => {
  if (!currentRefreshToken) {
    return;
  }

  await Session.updateOne(
    {
      tokenHash: hashToken(currentRefreshToken),
      revokedAt: null,
    },
    { $set: { revokedAt: new Date() } }
  );
};

const issueOneTimeToken = async ({
  user,
  purpose,
  createdBy = null,
  ttlMinutes,
}) => {
  const token = generateOneTimeToken();

  await runTransaction(async (session) => {
    await OneTimeToken.updateMany(
      {
        user: user._id,
        purpose,
        consumedAt: null,
      },
      { $set: { consumedAt: new Date() } },
      { session }
    );

    await OneTimeToken.create([{
      user: user._id,
      purpose,
      tokenHash: hashOneTimeToken(token),
      expiresAt: getTokenExpiry(ttlMinutes),
      createdBy,
    }], { session });
  });

  return token;
};

const forgotPassword = async (email) => {
  const user = await User.findOne({
    email: email.trim().toLowerCase(),
    isActive: true,
    isSetupComplete: { $ne: false },
  });

  if (!user) {
    return;
  }

  const token = await issueOneTimeToken({
    user,
    purpose: 'password_reset',
    ttlMinutes: env.RESET_TOKEN_TTL_MINUTES,
  });

  try {
    await sendPasswordReset({
      email: user.email,
      token,
    });
  }
  catch (error) {
    logger.error(
      'password_reset_email_failed',
      { error }
    );
  }
};

const consumePasswordToken = async ({
  token,
  password,
  purpose,
}) => runTransaction(async (session) => {
  const consumed = await OneTimeToken.findOneAndUpdate(
    {
      tokenHash: hashOneTimeToken(token),
      purpose,
      consumedAt: null,
      expiresAt: { $gt: new Date() },
    },
    { $set: { consumedAt: new Date() } },
    {
      returnDocument: 'after',
      session,
    }
  );

  if (!consumed) {
    throw new ApiError(
      400,
      'Invalid or expired one-time token'
    );
  }

  const user = await User.findById(consumed.user)
    .select('+password +authVersion')
    .session(session);

  if (
    !user ||
    (purpose === 'invite' && user.isSetupComplete) ||
    (purpose === 'password_reset' &&
      (!user.isActive || !user.isSetupComplete))
  ) {
    throw new ApiError(
      400,
      'Invalid or expired one-time token'
    );
  }

  user.password = password;
  user.isSetupComplete = true;
  user.isActive = true;
  user.authVersion += 1;
  await user.save({ session });

  await Session.updateMany(
    { user: user._id, revokedAt: null },
    { $set: { revokedAt: new Date() } },
    { session }
  );
  await OneTimeToken.updateMany(
    {
      user: user._id,
      consumedAt: null,
    },
    { $set: { consumedAt: new Date() } },
    { session }
  );

  return formatUser(user);
});

const setupPassword = (token, password) => (
  consumePasswordToken({
    token,
    password,
    purpose: 'invite',
  })
);

const resetPassword = (token, password) => (
  consumePasswordToken({
    token,
    password,
    purpose: 'password_reset',
  })
);

const changePassword = async (
  userId,
  currentPassword,
  newPassword
) => runTransaction(async (session) => {
  const user = await User.findById(userId)
    .select('+password +authVersion')
    .session(session);

  if (
    !user ||
    !user.isActive ||
    !(await user.comparePassword(currentPassword))
  ) {
    throw new ApiError(
      400,
      'Current password is incorrect'
    );
  }

  user.password = newPassword;
  user.authVersion += 1;
  await user.save({ session });

  await Session.updateMany(
    { user: user._id, revokedAt: null },
    { $set: { revokedAt: new Date() } },
    { session }
  );
});

export {
  formatUser,
  revokeUserSecurity,
  issueOneTimeToken,
  login,
  refresh,
  logout,
  forgotPassword,
  setupPassword,
  resetPassword,
  changePassword,
};
