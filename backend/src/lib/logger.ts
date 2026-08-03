/**
 * Structured logging. Redaction is not optional — auth code handles raw
 * tokens and passwords, and a single unredacted log line is a credential leak.
 */

import { pino } from 'pino';

import { env, isProduction, isTest } from '../config/env.js';

export const logger = pino({
  level: isTest ? 'silent' : env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      'password',
      'newPassword',
      'currentPassword',
      'passwordHash',
      'token',
      'refreshToken',
      'accessToken',
      'tokenHash',
      '*.password',
      '*.token',
      '*.passwordHash',
    ],
    censor: '[REDACTED]',
  },
  ...(isProduction
    ? {}
    : { transport: { target: 'pino-pretty', options: { colorize: true, singleLine: true } } }),
});

/**
 * Auth event log — the seed of the Phase 3 audit trail. Always includes an
 * event name and, where known, the user id.
 */
export function logAuthEvent(
  event: string,
  data: { userId?: string; email?: string; ip?: string; [k: string]: unknown } = {},
): void {
  logger.info({ authEvent: event, ...data }, `auth.${event}`);
}
