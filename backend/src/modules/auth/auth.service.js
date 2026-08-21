import bcrypt from 'bcrypt';

import User from '../users/user.model.js';
import Session from '../sessions/session.model.js';
import RefreshReplayHistory from '../sessions/refreshReplayHistory.model.js';
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
  generateRefreshTokenFamilyId,
  generateRefreshToken,
  getRefreshTokenFamilyId,
  hashToken,
  getRefreshTokenExpiry,
  getSessionAbsoluteExpiry,
} from '../../utils/refreshToken.js';
import {
  sendPasswordReset,
} from '../../mail/mail.service.js';
import {
  logAuditEvent,
} from '../audit/audit.service.js';
import logger from '../../observability/logger.js';


const DUMMY_PASSWORD_HASH =
  '$2b$12$tmCB9kkL5ESD/QEjWRa5SORnNYf0bScrh7eMydkrnY.XcbVCaUATa';
const FORGOT_PASSWORD_MIN_RESPONSE_MS = 250;


const delay = (milliseconds) => new Promise((resolve) => {
  setTimeout(resolve, milliseconds);
});


const compareLoginPassword = (
  user,
  password,
  compare = bcrypt.compare
) => compare(
  password,
  user?.password || DUMMY_PASSWORD_HASH
);

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

  const passwordIsCorrect = await compareLoginPassword(
    user,
    password
  );

  if (!user || !passwordIsCorrect) {
    throw new ApiError(
      401,
      'Invalid email or password'
    );
  }

  const accessToken = generateToken(user);
  const familyId = generateRefreshTokenFamilyId();
  const refreshToken = generateRefreshToken(familyId);
  const now = new Date();
  const absoluteExpiresAt = getSessionAbsoluteExpiry(now);

  await Session.create({
    user: user._id,
    familyId,
    tokenHash: hashToken(refreshToken),
    expiresAt: getRefreshTokenExpiry(now, absoluteExpiresAt),
    absoluteExpiresAt,
    issuedAuthVersion: user.authVersion ?? 0,
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
  const reused = await RefreshReplayHistory.findOne({
    tokenHash,
  }).select('user familyId').lean();

  if (!reused) {
    return false;
  }

  const invalidated = await runTransaction(async (session) => {
    const now = new Date();
    const compromised = await Session.findOneAndUpdate(
      {
        familyId: reused.familyId,
        compromisedAt: null,
        revokedAt: null,
        expiresAt: { $gt: now },
        absoluteExpiresAt: { $gt: now },
      },
      {
        $set: {
          compromisedAt: now,
          revokedAt: now,
        },
      },
      {
        returnDocument: 'after',
        session,
      }
    );

    if (!compromised) {
      return false;
    }

    await revokeUserSecurity(reused.user, session);
    return true;
  });

  if (invalidated && req) {
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
  const presentedFamilyId = getRefreshTokenFamilyId(
    currentRefreshToken
  );

  const result = await runTransaction(async (mongoSession) => {
    const now = new Date();
    const current = await Session.findOne({
      tokenHash,
      revokedAt: null,
      expiresAt: { $gt: now },
      absoluteExpiresAt: { $gt: now },
    })
      .select('+issuedAuthVersion')
      .session(mongoSession);

    if (!current) {
      return null;
    }

    const user = await User.findById(current.user)
      .select('+authVersion')
      .session(mongoSession);
    const currentVersion = user?.authVersion ?? 0;
    const familyMatches = !presentedFamilyId ||
      presentedFamilyId === current.familyId;

    if (
      !user ||
      !user.isActive ||
      user.isSetupComplete === false ||
      !Number.isInteger(current.issuedAuthVersion) ||
      current.issuedAuthVersion !== currentVersion ||
      !familyMatches
    ) {
      await Session.updateOne(
        {
          _id: current._id,
          tokenHash,
          revokedAt: null,
        },
        { $set: { revokedAt: now } },
        { session: mongoSession }
      );
      return { invalid: true };
    }

    const nextRefreshToken = generateRefreshToken(
      current.familyId
    );
    const nextExpiry = getRefreshTokenExpiry(
      now,
      current.absoluteExpiresAt
    );
    const rotated = await Session.findOneAndUpdate(
      {
        _id: current._id,
        tokenHash,
        revokedAt: null,
        expiresAt: { $gt: now },
        absoluteExpiresAt: { $gt: now },
      },
      {
        $set: {
          tokenHash: hashToken(nextRefreshToken),
          expiresAt: nextExpiry,
        },
      },
      {
        returnDocument: 'after',
        session: mongoSession,
      }
    );

    if (!rotated) {
      return null;
    }

    await RefreshReplayHistory.create([{
      tokenHash,
      user: current.user,
      familyId: current.familyId,
      expiresAt: current.absoluteExpiresAt,
    }], { session: mongoSession });

    return {
      invalid: false,
      nextRefreshToken,
      user,
    };
  });

  if (!result) {
    await handleRefreshReuse(tokenHash, req);

    throw new ApiError(
      401,
      'Invalid or expired session'
    );
  }

  if (result.invalid) {
    throw new ApiError(
      401,
      'Invalid or expired session'
    );
  }

  return {
    accessToken: generateToken(result.user),
    refreshToken: result.nextRefreshToken,
    user: formatUser(result.user),
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
  beforePersist = null,
}) => {
  const token = generateOneTimeToken();

  if (beforePersist) {
    await beforePersist();
  }

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

const forgotPassword = async (
  email,
  {
    now = Date.now,
    wait = delay,
  } = {}
) => {
  const startedAt = now();
  const user = await User.findOne({
    email: email.trim().toLowerCase(),
    isActive: true,
    isSetupComplete: { $ne: false },
  });

  if (!user) {
    await OneTimeToken.exists({
      tokenHash: hashOneTimeToken(
        generateOneTimeToken()
      ),
    });
  }
  else {
    const token = await issueOneTimeToken({
      user,
      purpose: 'password_reset',
      ttlMinutes: env.RESET_TOKEN_TTL_MINUTES,
    });

    void sendPasswordReset({
      email: user.email,
      token,
    })
      .catch((error) => {
        logger.error(
          'password_reset_email_failed',
          { error }
        );
      });
  }

  const remainingFloor = Math.max(
    0,
    FORGOT_PASSWORD_MIN_RESPONSE_MS - (now() - startedAt)
  );
  if (remainingFloor > 0) {
    await wait(remainingFloor);
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
    (purpose === 'invite' &&
      (user.isSetupComplete || user.deactivatedAt)) ||
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
  if (purpose === 'invite') {
    user.deactivatedAt = null;
    user.deactivatedBy = null;
  }
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
  DUMMY_PASSWORD_HASH,
  FORGOT_PASSWORD_MIN_RESPONSE_MS,
  compareLoginPassword,
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
