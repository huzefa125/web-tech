/**
 * Redis-backed rate limiting — §6 of the spec.
 *
 * Auth endpoints are limited by IP *and*, where a body email is present, by
 * that email. IP-only limiting is defeated by a botnet; email-only limiting is
 * defeated by rotating addresses. Both together cover the realistic attacks.
 */

import type { NextFunction, Request, Response } from 'express';
import { RateLimiterRedis, type RateLimiterRes } from 'rate-limiter-flexible';

import { env } from '../../config/env.js';
import { tooManyRequests } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { redis } from '../../lib/redis.js';

interface LimitSpec {
  points: number;
  durationSeconds: number;
  by: 'ip' | 'email' | 'user';
}

function makeLimiter(keyPrefix: string, spec: LimitSpec): RateLimiterRedis {
  return new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: `rl:${keyPrefix}`,
    points: spec.points,
    duration: spec.durationSeconds,
    // Fail open on a Redis outage rather than locking everyone out of login.
    insuranceLimiter: undefined,
  });
}

function clientIp(req: Request): string {
  // trust proxy is enabled in app.ts, so req.ip already respects
  // X-Forwarded-For from our own proxy only.
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

function resolveKey(req: Request, by: LimitSpec['by']): string | null {
  switch (by) {
    case 'ip':
      return clientIp(req);
    case 'email': {
      const email = (req.body as { email?: unknown } | undefined)?.email;
      return typeof email === 'string' && email.length > 0 ? email.trim().toLowerCase() : null;
    }
    case 'user':
      return req.user?.id ?? null;
  }
}

/**
 * Build middleware enforcing every given spec. All specs must pass; the
 * response reports the longest wait.
 */
export function rateLimit(name: string, ...specs: LimitSpec[]) {
  const limiters = specs.map((spec, i) => ({ spec, limiter: makeLimiter(`${name}:${i}`, spec) }));

  return async function rateLimitMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    if (!env.RATE_LIMIT_ENABLED) return next();

    for (const { spec, limiter } of limiters) {
      const key = resolveKey(req, spec.by);
      if (key === null) continue; // nothing to key on (e.g. no email in body)

      try {
        await limiter.consume(key);
      } catch (err) {
        // A RateLimiterRes rejection means the limit was hit. Anything else is
        // an infrastructure fault — fail open, since a Redis outage must not
        // take authentication down with it.
        if (err instanceof Error) {
          logger.error({ err, name }, 'rate limiter unavailable; failing open');
          return next();
        }
        const rl = err as RateLimiterRes;
        const retryAfter = Math.max(1, Math.ceil(rl.msBeforeNext / 1000));
        res.setHeader('Retry-After', String(retryAfter));
        res.setHeader('X-RateLimit-Limit', String(spec.points));
        res.setHeader('X-RateLimit-Remaining', String(Math.max(0, rl.remainingPoints)));
        return next(
          tooManyRequests('Too many requests. Please wait and try again.', { retryAfter }),
        );
      }
    }
    next();
  };
}

/** Limits from the table in spec §6. */
export const loginLimiter = rateLimit(
  'login',
  { points: 5, durationSeconds: 900, by: 'email' },
  { points: 20, durationSeconds: 900, by: 'ip' },
);

export const signupLimiter = rateLimit('signup', { points: 3, durationSeconds: 3600, by: 'ip' });

export const forgotPasswordLimiter = rateLimit('forgot', {
  points: 3,
  durationSeconds: 3600,
  by: 'email',
});

export const resendVerificationLimiter = rateLimit('resend', {
  points: 3,
  durationSeconds: 3600,
  by: 'email',
});

export const refreshLimiter = rateLimit('refresh', {
  points: 60,
  durationSeconds: 3600,
  by: 'ip',
});

/** Broad backstop for the rest of the auth surface. */
export const generalAuthLimiter = rateLimit('auth', {
  points: 100,
  durationSeconds: 900,
  by: 'ip',
});
