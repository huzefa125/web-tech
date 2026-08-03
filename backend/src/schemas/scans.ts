/** Request contracts for the scan API. */

import { z } from 'zod';

export const createScanSchema = z.object({
  /**
   * Deliberately loose: users type `nike.com`, `https://nike.com/`, or
   * `www.nike.com/en`. Normalisation and the real validation (including the
   * SSRF checks) live in lib/scan-target.ts — a URL that merely parses is not
   * a URL that is safe to fetch.
   */
  url: z.string().trim().min(1, 'Enter a website to scan').max(2048),
});

export const scanIdSchema = z.uuid();

export const listScansSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type CreateScanInput = z.infer<typeof createScanSchema>;
