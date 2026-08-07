/**
 * Scan API — module 1's HTTP surface.
 *
 * Every route requires a bearer token: scans cost real compute, so there is no
 * anonymous entry point. Quota enforcement lives in the service layer, which is
 * also what the worker and any future scheduler go through.
 */

import { Router } from 'express';

import { notFound } from '../../lib/errors.js';
import { createScanSchema, listScansSchema, scanIdSchema } from '../../schemas/scans.js';
import * as scanService from '../../services/scan-service.js';
import { requireAuth } from '../middleware/authenticate.js';
import { generalAuthLimiter } from '../middleware/rate-limit.js';

export const scansRouter = Router();

scansRouter.use(requireAuth);

/** Queue a scan. Returns immediately — the crawl runs on the worker. */
scansRouter.post('/', generalAuthLimiter, async (req, res) => {
  const { url } = createScanSchema.parse(req.body);

  const { scan, website } = await scanService.requestScan({
    url,
    userId: req.user!.id,
    plan: req.user!.plan,
  });

  res.status(202).json({
    scan: {
      id: scan.id,
      status: scan.status,
      host: website.host,
      queuedAt: scan.queuedAt.toISOString(),
    },
  });
});

scansRouter.get('/', async (req, res) => {
  const { limit, offset } = listScansSchema.parse(req.query);
  const scans = await scanService.listScansForUser(req.user!.id, limit, offset);
  res.json({ scans });
});

/** Remaining quota for the current user — the dashboard shows this. */
scansRouter.get('/quota', async (req, res) => {
  const limit = scanService.dailyScanLimit(req.user!.plan);
  const used = await scanService.scansToday(req.user!.id);
  res.json({
    plan: req.user!.plan,
    limit,
    used,
    remaining: limit === null ? null : Math.max(0, limit - used),
  });
});

scansRouter.get('/:id', async (req, res) => {
  const id = scanIdSchema.safeParse(req.params.id);
  if (!id.success) throw notFound('Scan not found');

  const detail = await scanService.getScanDetail(id.data);
  // Scoped to the requester: scan ids are uuids, but a leaked one must not
  // expose another user's crawl.
  if (!detail || detail.scan.requestedBy !== req.user!.id) throw notFound('Scan not found');

  res.json({
    scan: {
      id: detail.scan.id,
      status: detail.scan.status,
      host: detail.website.host,
      finalUrl: detail.scan.finalUrl,
      httpStatus: detail.scan.httpStatus,
      responseHeaders: detail.scan.responseHeaders,
      loadTimeMs: detail.scan.loadTimeMs,
      errorCode: detail.scan.errorCode,
      errorMessage: detail.scan.errorMessage,
      queuedAt: detail.scan.queuedAt.toISOString(),
      startedAt: detail.scan.startedAt?.toISOString() ?? null,
      finishedAt: detail.scan.finishedAt?.toISOString() ?? null,
    },
    assets: detail.assets,
    technologies: detail.technologies.map((t) => ({
      name: t.name,
      category: t.category,
      version: t.version,
      confidence: t.confidence,
      evidence: t.evidence,
    })),
  });
});
