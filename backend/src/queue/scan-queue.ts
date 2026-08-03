/** The scan queue — producer side. The worker lives in src/workers. */

import { Queue } from 'bullmq';

import { env } from '../config/env.js';
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
 */
export async function enqueueScan(data: ScanJobData): Promise<string> {
  const job = await getScanQueue().add('crawl', data, { jobId: data.scanId });
  return job.id!;
}

export async function closeScanQueue(): Promise<void> {
  await queue?.close();
  queue = null;
}
