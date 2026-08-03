/**
 * Redis connection for BullMQ.
 *
 * Separate from `lib/redis.ts` on purpose: BullMQ requires
 * `maxRetriesPerRequest: null` on its blocking connections, and setting that on
 * the shared client would change how rate limiting behaves during a Redis
 * outage — there, failing fast is what keeps login available.
 */

import { Redis } from 'ioredis';

import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

let connection: Redis | null = null;

export function getQueueConnection(): Redis {
  if (connection) return connection;

  connection = new Redis(env.REDIS_URL, {
    // Required by BullMQ: its blocking commands must not be aborted by the
    // client's own retry ceiling.
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  connection.on('error', (err) => logger.error({ err }, 'queue redis error'));
  return connection;
}

export async function closeQueueConnection(): Promise<void> {
  await connection?.quit();
  connection = null;
}
