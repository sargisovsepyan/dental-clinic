import crypto from 'crypto';

const generateOneTimeToken = () => (
  crypto.randomBytes(32).toString('base64url')
);

const hashOneTimeToken = (token) => (
  crypto
    .createHash('sha256')
    .update(token, 'utf8')
    .digest('hex')
);

const getTokenExpiry = (minutes) => (
  new Date(Date.now() + minutes * 60_000)
);

export {
  generateOneTimeToken,
  hashOneTimeToken,
  getTokenExpiry,
};
