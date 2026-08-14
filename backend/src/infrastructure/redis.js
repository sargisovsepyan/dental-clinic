import { createClient } from 'redis';

import env from '../config/env.js';
import logger from '../observability/logger.js';


let client = null;
let resolveConnection;
let rejectConnection;
const connectionReady = new Promise((resolve, reject) => {
  resolveConnection = resolve;
  rejectConnection = reject;
});


const getRedisClient = () => {
  if (env.RATE_LIMIT_STORE !== 'redis') {
    return null;
  }
  if (env.NODE_ENV === 'test') {
    throw new Error('Tests are not allowed to create a Redis client');
  }

  if (!client) {
    client = createClient({
      url: env.REDIS_URL,
      socket: {
        connectTimeout: env.REDIS_CONNECT_TIMEOUT_MS,
        reconnectStrategy: (retries) => Math.min(100 + retries * 200, 3000),
      },
    });
    client.on('error', (error) => {
      logger.error('redis_client_error', { error });
    });
    client.on('reconnecting', () => {
      logger.warn('redis_client_reconnecting');
    });
  }

  return client;
};


const connectRedis = async () => {
  const redisClient = getRedisClient();
  if (!redisClient) {
    return;
  }
  try {
    if (!redisClient.isOpen) {
      await redisClient.connect();
    }
    await redisClient.ping();
    resolveConnection();
    logger.info('redis_connected');
  }
  catch (error) {
    rejectConnection(error);
    throw error;
  }
};


const sendRedisCommand = async (args) => {
  await connectionReady;
  return getRedisClient().sendCommand(args);
};


const isRedisReady = async () => {
  if (env.RATE_LIMIT_STORE !== 'redis') {
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
  if (!client?.isOpen) {
    return;
  }
  await client.quit();
};


export {
  getRedisClient,
  sendRedisCommand,
  connectRedis,
  isRedisReady,
  closeRedis,
};
