/**
 * Scan schema — the `websites` / `scans` core from §4 of requirement.md, plus
 * the crawler's own output (§7 module 1).
 *
 * Two ideas shape this file:
 *   1. A `website` is the long-lived entity; a `scan` is one observation of it
 *      at a point in time. §1 of the spec makes historical diffing the core
 *      differentiator, so nothing here ever overwrites a previous scan — every
 *      run appends.
 *   2. Captured bytes (HTML, CSS, JS, screenshots) do not belong in Postgres.
 *      Rows hold metadata and a storage key; the payload lives behind the
 *      storage adapter.
 */

import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { users } from './auth.js';

export const SCAN_STATUSES = ['queued', 'running', 'succeeded', 'failed', 'cancelled'] as const;
export const ASSET_KINDS = ['html', 'css', 'js'] as const;

export type ScanStatus = (typeof SCAN_STATUSES)[number];
export type AssetKind = (typeof ASSET_KINDS)[number];

/**
 * A site we track over time. Keyed by registrable host, lowercased — the user
 * may type `https://Nike.com/products?x=1`, but that is the same website as
 * `nike.com` and its scans must land on one timeline.
 */
export const websites = pgTable(
  'websites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Normalised host, no scheme, no port, no trailing dot. */
    host: varchar('host', { length: 253 }).notNull(),
    /** The URL actually fetched, kept for display and for re-scans. */
    canonicalUrl: text('canonical_url').notNull(),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastScannedAt: timestamp('last_scanned_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('uq_websites_host').on(t.host)],
);

/**
 * One scan run. `requestedBy` is nullable so a scheduled or system-initiated
 * scan (Phase 2) survives the user being deleted — the observation stays on the
 * website's timeline even when the requester does not.
 */
export const scans = pgTable(
  'scans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    websiteId: uuid('website_id')
      .notNull()
      .references(() => websites.id, { onDelete: 'cascade' }),
    requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),

    status: varchar('status', { length: 20 }).notNull().default('queued').$type<ScanStatus>(),
    /** BullMQ job id, so a row can be traced back to its queue entry. */
    jobId: varchar('job_id', { length: 64 }),

    /** Final URL after redirects, and the status code that produced it. */
    finalUrl: text('final_url'),
    httpStatus: integer('http_status'),
    /** Response headers of the main document — modules 4 and 7 read these. */
    responseHeaders: jsonb('response_headers').$type<Record<string, string>>(),
    /** Wall-clock time of the page load, in milliseconds. */
    loadTimeMs: integer('load_time_ms'),

    /** Populated when status = 'failed'. Stable code + human-readable detail. */
    errorCode: varchar('error_code', { length: 40 }),
    errorMessage: text('error_message'),

    queuedAt: timestamp('queued_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    index('ix_scans_website_time').on(t.websiteId, t.queuedAt),
    index('ix_scans_requested_by').on(t.requestedBy),
    index('ix_scans_status').on(t.status),
  ],
);

/**
 * A captured HTML/CSS/JS resource. The bytes live in storage under
 * `storageKey`; `sha256` lets a later scan notice the file is byte-identical to
 * the previous one, which is what makes §23's timeline diffing cheap.
 */
export const scanAssets = pgTable(
  'scan_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scanId: uuid('scan_id')
      .notNull()
      .references(() => scans.id, { onDelete: 'cascade' }),

    kind: varchar('kind', { length: 10 }).notNull().$type<AssetKind>(),
    /** Absolute URL the resource was fetched from. */
    url: text('url').notNull(),
    storageKey: text('storage_key').notNull(),
    /** Bytes stored. bigint because a bundled JS file can exceed 2 GB in theory. */
    byteSize: bigint('byte_size', { mode: 'number' }).notNull(),
    sha256: varchar('sha256', { length: 64 }).notNull(),
    contentType: varchar('content_type', { length: 120 }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('ix_scan_assets_scan_kind').on(t.scanId, t.kind),
    index('ix_scan_assets_sha').on(t.sha256),
  ],
);

export const screenshots = pgTable(
  'screenshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scanId: uuid('scan_id')
      .notNull()
      .references(() => scans.id, { onDelete: 'cascade' }),

    storageKey: text('storage_key').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    byteSize: bigint('byte_size', { mode: 'number' }).notNull(),
    /** 'viewport' or 'fullPage' — the dashboard wants both eventually. */
    kind: varchar('kind', { length: 20 }).notNull().default('viewport'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ix_screenshots_scan').on(t.scanId)],
);

export type Website = typeof websites.$inferSelect;
export type NewWebsite = typeof websites.$inferInsert;
export type Scan = typeof scans.$inferSelect;
export type NewScan = typeof scans.$inferInsert;
export type ScanAsset = typeof scanAssets.$inferSelect;
export type Screenshot = typeof screenshots.$inferSelect;
