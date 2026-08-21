import env from '../config/env.js';
import ApiError from '../utils/ApiError.js';


const TURNSTILE_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


const defaultChallengeRequest = env.NODE_ENV === 'test'
  ? async () => {
      throw new Error('Tests cannot contact the bot-challenge provider');
    }
  : fetch;


const createBotChallengeVerifier = ({
  provider = env.PUBLIC_BOOKING_CHALLENGE_PROVIDER,
  secret = env.PUBLIC_BOOKING_CHALLENGE_SECRET,
  request = defaultChallengeRequest,
  timeoutMs = env.PUBLIC_BOOKING_CHALLENGE_TIMEOUT_MS,
} = {}) => async ({ token, idempotencyKey = '' }) => {
  if (provider === 'disabled') {
    return;
  }
  if (provider !== 'turnstile' || !secret || !token) {
    throw new ApiError(400, 'Bot challenge verification is required');
  }
  if (idempotencyKey && !UUID_V4_PATTERN.test(idempotencyKey)) {
    throw new ApiError(400, 'A valid booking idempotency key is required');
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
        ...(UUID_V4_PATTERN.test(idempotencyKey)
          ? { idempotency_key: idempotencyKey.toLowerCase() }
          : {}),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  }
  catch {
    throw new ApiError(503, 'Bot challenge verification is unavailable');
  }

  let result;
  try {
    result = await response.json();
  }
  catch {
    throw new ApiError(503, 'Bot challenge verification is unavailable');
  }
  if (!response.ok || result?.success !== true) {
    throw new ApiError(400, 'Bot challenge verification failed');
  }
};


const verifyPublicBookingChallenge = createBotChallengeVerifier();


export {
  TURNSTILE_URL,
  UUID_V4_PATTERN,
  createBotChallengeVerifier,
  verifyPublicBookingChallenge,
};
