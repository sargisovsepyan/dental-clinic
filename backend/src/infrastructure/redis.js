import { createClient } from 'redis';

import env from '../config/env.js';
import logger from '../observability/logger.js';


let client = null;


const setRedisClientForTests = (redisClient) => {
  if (env.NODE_ENV !== 'test') {
    throw new Error('Redis client injection is only allowed in tests');
  }
  client = redisClient;
};


const resetRedisClientForTests = () => {
  if (env.NODE_ENV !== 'test') {
    throw new Error('Redis client reset is only allowed in tests');
  }
  client = null;
};


const getRedisClient = () => {
  if (client) {
    return client;
  }
  if (env.RATE_LIMIT_STORE !== 'redis') {
    return null;
  }
  if (env.NODE_ENV === 'test') {
    throw new Error('Tests are not allowed to create a Redis client');
  }

  client = createClient({
    url: env.REDIS_URL,
    socket: {
      connectTimeout: env.REDIS_CONNECT_TIMEOUT_MS,
      reconnectStrategy: (retries) => Math.min(100 + retries * 200, 3000),
    },
    disableOfflineQueue: true,
  });
  client.on('error', (error) => {
    logger.error('redis_client_error', { error });
  });
  client.on('reconnecting', () => {
    logger.warn('redis_client_reconnecting');
  });

  return client;
};


const withTimeout = async (operation, timeoutMs, message) => {
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(
      () => reject(new Error(message)),
      timeoutMs
    );
  });

  try {
    return await Promise.race([operation, timeoutPromise]);
  }
  finally {
    clearTimeout(timeout);
  }
};


const destroyFailedClient = (redisClient) => {
  try {
    redisClient.destroy?.();
  }
  catch (error) {
    logger.warn('redis_client_destroy_failed', { error });
  }
  if (client === redisClient) {
    client = null;
  }
};


const connectRedis = async ({
  timeoutMs = env.REDIS_CONNECT_TIMEOUT_MS,
} = {}) => {
  const redisClient = getRedisClient();
  if (!redisClient) {
    return;
  }

  const startupAttempt = Promise.resolve().then(async () => {
    if (!redisClient.isOpen) {
      await redisClient.connect();
    }
    await redisClient.ping();
  });

  try {
    await withTimeout(
      startupAttempt,
      timeoutMs,
      'Redis startup connection timed out'
    );
    logger.info('redis_connected');
  }
  catch (error) {
    destroyFailedClient(redisClient);
    throw error;
  }
};


const sendRedisCommand = async (args) => {
  const redisClient = getRedisClient();
  if (!redisClient?.isReady) {
    throw new Error('Redis is not ready');
  }
  return redisClient.sendCommand(args);
};


const isRedisReady = async () => {
  if (env.RATE_LIMIT_STORE !== 'redis' && !client) {
    return true;
  }
  const redisClient = getRedisClient();
  if (!redisClient?.isReady) {
    return false;
  }
  try {
    await Promise.race([
      redisClient.ping(),
      new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error('Redis health check timed out')),
          env.HEALTH_CHECK_TIMEOUT_MS
        ).unref();
      }),
    ]);
    return true;
  }
  catch {
    return false;
  }
};


const closeRedis = async () => {
  const redisClient = client;
  client = null;
  if (!redisClient?.isOpen) {
    return;
  }
  await redisClient.quit();
};


export {
  getRedisClient,
  sendRedisCommand,
  connectRedis,
  isRedisReady,
  closeRedis,
  setRedisClientForTests,
  resetRedisClientForTests,
};
