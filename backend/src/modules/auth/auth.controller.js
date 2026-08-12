import * as authService from './auth.service.js';

import env from '../../config/env.js';

const REFRESH_COOKIE =
  'refresh_token';

const getCookieOptions = () => ({
  httpOnly: true,

  secure:
    env.NODE_ENV === 'production',

  sameSite: 'strict',

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
      currentRefreshToken
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

export {
  login,
  refresh,
  logout,
  getMe,
};