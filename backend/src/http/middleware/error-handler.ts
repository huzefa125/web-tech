/** Terminal error handler. Every error response in the API has this shape. */

import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

import { isProduction } from '../../config/env.js';
import { AppError, type ErrorCode } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';

export interface ErrorBody {
  error: { code: ErrorCode; message: string; details?: unknown };
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) return next(err);

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    } satisfies ErrorBody);
    return;
  }

  if (err instanceof AppError) {
    // 4xx are expected client outcomes, not incidents — log at debug.
    const level = err.statusCode >= 500 ? 'error' : 'debug';
    logger[level]({ err, code: err.code, path: req.path }, 'request failed');
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    } satisfies ErrorBody);
    return;
  }

  logger.error({ err, path: req.path, method: req.method }, 'unhandled error');
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      // Never leak internals to the client in production.
      message: isProduction
        ? 'Something went wrong'
        : err instanceof Error
          ? err.message
          : String(err),
    },
  } satisfies ErrorBody);
}
