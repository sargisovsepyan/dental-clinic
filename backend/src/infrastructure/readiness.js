import mongoose from 'mongoose';

import env from '../config/env.js';
import { isRedisReady } from './redis.js';


const createReadinessChecker = ({
  mongoProbe,
  redisProbe,
  now = () => Date.now(),
  successCacheMs = env.READINESS_CACHE_MS,
  failureCacheMs = env.READINESS_FAILURE_CACHE_MS,
} = {}) => {
  let cached = null;
  let inFlight = null;

  const probeMongo = mongoProbe || (async () => {
    if (
      mongoose.connection.readyState !== 1 ||
      !mongoose.connection.db
    ) {
      return false;
    }

    try {
      await mongoose.connection.db.command(
        { ping: 1 },
        { maxTimeMS: env.HEALTH_CHECK_TIMEOUT_MS }
      );
      return true;
    }
    catch {
      return false;
    }
  });
  const probeRedis = redisProbe || isRedisReady;

  const run = async () => {
    const [mongoReady, redisReady] = await Promise.all([
      probeMongo(),
      probeRedis(),
    ]);
    return {
      ready: Boolean(mongoReady && redisReady),
    };
  };

  return async () => {
    const timestamp = now();
    if (cached && timestamp < cached.expiresAt) {
      return cached.result;
    }
    if (inFlight) {
      return inFlight;
    }

    inFlight = run()
      .catch(() => ({ ready: false }))
      .then((result) => {
        cached = {
          result,
          expiresAt:
            now() + (result.ready ? successCacheMs : failureCacheMs),
        };
        return result;
      })
      .finally(() => {
        inFlight = null;
      });

    return inFlight;
  };
};


const checkReadiness = createReadinessChecker();


export {
  createReadinessChecker,
  checkReadiness,
};
