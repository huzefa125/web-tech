/**
 * Scan worker — consumer side of the scan queue.
 *
 * Runs as its own process (`npm run worker`), not inside the API. Playwright is
 * memory-hungry and a crashed renderer must not take the API down with it, so
 * the two scale and fail independently.
 */

import { Worker, type Job } from 'bullmq';

import { env } from '../config/env.js';
import { closeDb } from '../db/index.js';
import { logger } from '../lib/logger.js';
import { getQueueConnection, closeQueueConnection } from '../queue/connection.js';
import { SCAN_QUEUE_NAME, type ScanJobData } from '../queue/scan-queue.js';
import { closeBrowser } from '../services/crawler.js';
import { runScan } from '../services/scan-service.js';

export function createScanWorker(): Worker<ScanJobData> {
  const worker = new Worker<ScanJobData>(
    SCAN_QUEUE_NAME,
    async (job: Job<ScanJobData>) => {
      logger.info({ jobId: job.id, scanId: job.data.scanId }, 'scan job started');
      await runScan(job.data.scanId, job.data.url);
    },
    {
      connection: getQueueConnection(),
      concurrency: env.SCAN_QUEUE_CONCURRENCY,
      // A hung page must not hold a slot forever; the crawler's own navigation
      // timeout is well inside this ceiling.
      lockDuration: env.CRAWLER_NAV_TIMEOUT_MS * 3,
    },
  );

  worker.on('failed', (job, err) => {
    logger.warn(
      { jobId: job?.id, scanId: job?.data.scanId, attempt: job?.attemptsMade, err },
      'scan job failed',
    );
  });

  worker.on('error', (err) => logger.error({ err }, 'scan worker error'));

  return worker;
}

/** Entry point when this module is run directly. */
async function main(): Promise<void> {
  const worker = createScanWorker();
  logger.info({ concurrency: env.SCAN_QUEUE_CONCURRENCY }, 'scan worker ready');

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'scan worker shutting down');
    // close() waits for in-flight jobs, so a scan mid-crawl is not orphaned.
    await worker.close();
    await Promise.allSettled([closeBrowser(), closeQueueConnection(), closeDb()]);
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

// Only run when executed directly, so tests can import createScanWorker.
if (process.argv[1]?.includes('scan-worker')) {
  void main();
}
