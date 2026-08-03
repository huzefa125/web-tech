/** The scan queue — producer side. The worker lives in src/workers. */

import { Queue } from 'bullmq';

import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { getQueueConnection } from './connection.js';

export const SCAN_QUEUE_NAME = 'scans';

export interface ScanJobData {
  scanId: string;
  url: string;
}

let queue: Queue<ScanJobData> | null = null;

export function getScanQueue(): Queue<ScanJobData> {
  queue ??= new Queue<ScanJobData>(SCAN_QUEUE_NAME, {
    connection: getQueueConnection(),
    defaultJobOptions: {
      attempts: env.SCAN_JOB_ATTEMPTS,
      // A site that is down for one attempt is often up for the next; back off
      // rather than burning all three retries inside a second.
      backoff: { type: 'exponential', delay: 5_000 },
      // Keep a short tail for debugging, but do not let Redis accumulate every
      // job this service has ever run — Postgres is the record, not the queue.
      removeOnComplete: { age: 3_600, count: 500 },
      removeOnFail: { age: 86_400, count: 1_000 },
    },
  });
  return queue;
}

/**
 * Enqueue a scan. The job id is the scan id, which makes enqueueing idempotent:
 * a retried request for the same scan row cannot produce two crawls.
 *
 * Under the inline driver there is no queue at all — the crawl is started in
 * this process and deliberately not awaited, so the HTTP response still
 * returns immediately and the polling UI behaves the same. See
 * SCAN_QUEUE_DRIVER in config/env.ts for what that costs.
 */
export async function enqueueScan(data: ScanJobData): Promise<string> {
  if (env.SCAN_QUEUE_DRIVER === 'inline') {
    const { runScan } = await import('../services/scan-service.js');
    void runScan(data.scanId, data.url).catch((err: unknown) => {
      // runScan has already recorded the failure on the row; without this
      // catch the rejection would be unhandled and could kill the process.
      logger.warn({ err, scanId: data.scanId }, 'inline scan failed');
    });
    return data.scanId;
  }

  const job = await getScanQueue().add('crawl', data, { jobId: data.scanId });
  return job.id!;
}

export async function closeScanQueue(): Promise<void> {
  await queue?.close();
  queue = null;
}
