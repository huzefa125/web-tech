/** Shared Redis connection — OAuth state storage and rate limiting. */

import { Redis } from 'ioredis';

import { env } from '../config/env.js';
import { logger } from './logger.js';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null, // required by BullMQ, harmless elsewhere
  enableReadyCheck: true,
  lazyConnect: false,
});

redis.on('error', (err) => logger.error({ err }, 'redis error'));
redis.on('connect', () => logger.debug('redis connected'));

export async function closeRedis(): Promise<void> {
  await redis.quit();
}
