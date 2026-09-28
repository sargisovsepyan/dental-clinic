import env from '../config/env.js';
import logger from '../observability/logger.js';
import ApiError from '../utils/ApiError.js';


const TURNSTILE_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TURNSTILE_ERROR_CODES = new Set([
  'missing-input-secret',
  'invalid-input-secret',
  'missing-input-response',
  'invalid-input-response',
  'bad-request',
  'timeout-or-duplicate',
  'internal-error',
]);


const defaultChallengeRequest = env.NODE_ENV === 'test'
  ? async () => {
      throw new Error('Tests cannot contact the bot-challenge provider');
    }
  : fetch;


const boundedDiagnostic = (value, maxLength, pattern) => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength && pattern.test(normalized)
    ? normalized
    : undefined;
};


const getTurnstileErrorCodes = (result) => Array.isArray(result?.['error-codes'])
  ? [...new Set(result['error-codes'])]
    .filter((code) => TURNSTILE_ERROR_CODES.has(code))
    .slice(0, TURNSTILE_ERROR_CODES.size)
  : [];


const getTurnstileFailureCategory = (response, errorCodes) => {
  if (!response?.ok) {
    return 'provider-http';
  }
  if (errorCodes.some((code) => [
    'missing-input-secret',
    'invalid-input-secret',
  ].includes(code))) {
    return 'configuration';
  }
  if (errorCodes.includes('timeout-or-duplicate')) {
    return 'expired-or-duplicate';
  }
  if (errorCodes.includes('internal-error')) {
    return 'provider-internal';
  }
  if (errorCodes.some((code) => [
    'missing-input-response',
    'invalid-input-response',
    'bad-request',
  ].includes(code))) {
    return 'invalid-response';
  }
  return 'provider-rejected';
};


const logTurnstileFailure = ({
  log,
  requestId,
  response,
  result,
  failureCategory,
}) => {
  const errorCodes = getTurnstileErrorCodes(result);
  const safeRequestId = boundedDiagnostic(
    requestId,
    128,
    /^[a-z0-9._:-]+$/i
  );
  const hostname = boundedDiagnostic(
    result?.hostname,
    253,
    /^[a-z0-9.-]+$/i
  );
  const action = boundedDiagnostic(
    result?.action,
    100,
    /^[a-z0-9_-]+$/i
  );
  const providerStatus = Number.isInteger(response?.status) &&
    response.status >= 100 && response.status <= 599
    ? response.status
    : undefined;

  log.warn('public_booking_challenge_failed', {
    failureCategory: failureCategory ||
      getTurnstileFailureCategory(response, errorCodes),
    ...(safeRequestId ? { requestId: safeRequestId } : {}),
    ...(providerStatus ? { providerStatus } : {}),
    ...(errorCodes.length ? { errorCodes } : {}),
    ...(hostname ? { hostname } : {}),
    ...(action ? { action } : {}),
  });
};


const createBotChallengeVerifier = ({
  provider = env.PUBLIC_BOOKING_CHALLENGE_PROVIDER,
  secret = env.PUBLIC_BOOKING_CHALLENGE_SECRET,
  request = defaultChallengeRequest,
  timeoutMs = env.PUBLIC_BOOKING_CHALLENGE_TIMEOUT_MS,
  log = logger,
} = {}) => async ({ token, requestId = '' }) => {
  if (provider === 'disabled') {
    return;
  }
  if (provider !== 'turnstile' || !secret || !token) {
    throw new ApiError(400, 'Bot challenge verification is required');
  }
  let response;
  try {
    response = await request(TURNSTILE_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        secret,
        response: token,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  }
  catch {
    logTurnstileFailure({
      log,
      requestId,
      failureCategory: 'provider-unavailable',
    });
    throw new ApiError(503, 'Bot challenge verification is unavailable');
  }

  let result;
  try {
    result = await response.json();
  }
  catch {
    logTurnstileFailure({
      log,
      requestId,
      response,
      failureCategory: 'provider-invalid-response',
    });
    throw new ApiError(503, 'Bot challenge verification is unavailable');
  }
  if (!response.ok || result?.success !== true) {
    logTurnstileFailure({ log, requestId, response, result });
    throw new ApiError(400, 'Bot challenge verification failed', {
      code: 'BOOKING_CHALLENGE_FAILED',
    });
  }
};


const verifyPublicBookingChallenge = createBotChallengeVerifier();


export {
  TURNSTILE_URL,
  createBotChallengeVerifier,
  verifyPublicBookingChallenge,
};
