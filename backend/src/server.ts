/** Process entry point. */

import { createApp } from './app.js';
import { env } from './config/env.js';
import { closeDb } from './db/index.js';
import { closeRedis } from './lib/redis.js';
import { logger } from './lib/logger.js';

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, `API listening on :${env.PORT}`);
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'shutting down');
  server.close(async () => {
    try {
      await Promise.allSettled([closeDb(), closeRedis()]);
    } finally {
      process.exit(0);
    }
  });
  // Don't let a hung connection block the deploy forever.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'unhandled promise rejection');
  process.exit(1);
});
