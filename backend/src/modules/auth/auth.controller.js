import * as authService from './auth.service.js';

import env from '../../config/env.js';

const REFRESH_COOKIE =
  'refresh_token';

const getCookieOptions = () => ({
  httpOnly: true,

  secure:
    env.REFRESH_COOKIE_SECURE,

  sameSite:
    env.REFRESH_COOKIE_SAME_SITE,

  ...(env.REFRESH_COOKIE_DOMAIN
    ? { domain: env.REFRESH_COOKIE_DOMAIN }
    : {}),

  path: '/api/v1/auth',

  maxAge:
    env.REFRESH_TOKEN_TTL_DAYS *
    24 *
    60 *
    60 *
    1000,
});

const login = async (req, res) => {
  const { email, password } = req.body;

  const result =
    await authService.login(
      email,
      password,
      req.get('user-agent') || ''
    );

  res.cookie(
    REFRESH_COOKIE,
    result.refreshToken,
    getCookieOptions()
  );

  res.status(200).json({
    success: true,

    message:
      'Login successful',

    data: {
      accessToken:
        result.accessToken,

      user:
        result.user,
    },
  });
};

const refresh = async (req, res) => {
  const currentRefreshToken =
    req.cookies?.[REFRESH_COOKIE];

  const result =
    await authService.refresh(
      currentRefreshToken,
      req
    );

  res.cookie(
    REFRESH_COOKIE,
    result.refreshToken,
    getCookieOptions()
  );

  res.status(200).json({
    success: true,

    data: {
      accessToken:
        result.accessToken,

      user:
        result.user,
    },
  });
};

const logout = async (req, res) => {
  const currentRefreshToken =
    req.cookies?.[REFRESH_COOKIE];

  await authService.logout(
    currentRefreshToken
  );

  const clearOptions =
    getCookieOptions();

  delete clearOptions.maxAge;

  res.clearCookie(
    REFRESH_COOKIE,
    clearOptions
  );

  res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
};

const getMe = async (req, res) => {
  res.status(200).json({
    success: true,

    data: {
      user: req.user,
    },
  });
};

const changePassword = async (req, res) => {
  await authService.changePassword(
    req.user.id,
    req.body.currentPassword,
    req.body.newPassword
  );

  const clearOptions = getCookieOptions();
  delete clearOptions.maxAge;
  res.clearCookie(REFRESH_COOKIE, clearOptions);

  res.status(200).json({
    success: true,
    message:
      'Password changed. Please sign in again.',
  });
};

const forgotPassword = async (req, res) => {
  await authService.forgotPassword(req.body.email);

  res.status(202).json({
    success: true,
    message:
      'If the account is eligible, password reset instructions will be sent.',
  });
};

const resetPassword = async (req, res) => {
  const user = await authService.resetPassword(
    req.body.token,
    req.body.password
  );

  res.status(200).json({
    success: true,
    message: 'Password reset. Please sign in.',
    data: { user },
  });
};

const setupPassword = async (req, res) => {
  const user = await authService.setupPassword(
    req.body.token,
    req.body.password
  );

  res.status(200).json({
    success: true,
    message:
      'Staff account setup completed. Please sign in.',
    data: { user },
  });
};

export {
  login,
  refresh,
  logout,
  getMe,
  changePassword,
  forgotPassword,
  resetPassword,
  setupPassword,
};
