/** Bearer-token authentication. */

import type { NextFunction, Request, Response } from 'express';

import type { Plan } from '../../db/schema/auth.js';
import { unauthorized } from '../../lib/errors.js';
import { verifyAccessToken } from '../../lib/jwt.js';

export interface AuthedUser {
  id: string;
  email: string;
  plan: Plan;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

function extractBearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

/** Rejects the request when there is no valid access token. */
export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const token = extractBearer(req);
  if (!token) return next(unauthorized('UNAUTHENTICATED', 'Missing access token'));

  const claims = await verifyAccessToken(token);
  if (!claims) return next(unauthorized('INVALID_TOKEN', 'Invalid or expired access token'));

  req.user = { id: claims.sub, email: claims.email, plan: claims.plan };
  next();
}

/** Populates req.user when a valid token is present, but never rejects. */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const token = extractBearer(req);
  if (token) {
    const claims = await verifyAccessToken(token);
    if (claims) req.user = { id: claims.sub, email: claims.email, plan: claims.plan };
  }
  next();
}
