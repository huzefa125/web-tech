/** Refresh-cookie helpers — §3.1 of the spec. */

import type { CookieOptions, Response } from 'express';

import { REFRESH_COOKIE_NAME, REFRESH_COOKIE_PATH, env } from '../config/env.js';

function baseOptions(): CookieOptions {
  return {
    httpOnly: true, // JS can never read it — the point of the design
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAMESITE,
    path: REFRESH_COOKIE_PATH, // not sent to every route
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };
}

export function setRefreshCookie(res: Response, raw: string, expiresAt: Date): void {
  res.cookie(REFRESH_COOKIE_NAME, raw, { ...baseOptions(), expires: expiresAt });
}

export function clearRefreshCookie(res: Response): void {
  // Attributes must match the ones used to set it or the browser keeps it.
  res.clearCookie(REFRESH_COOKIE_NAME, baseOptions());
}

export function readRefreshCookie(cookies: Record<string, string> | undefined): string | null {
  return cookies?.[REFRESH_COOKIE_NAME] ?? null;
}

export { REFRESH_COOKIE_NAME };
