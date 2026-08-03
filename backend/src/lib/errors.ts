/**
 * Typed application errors. Every auth failure the client is allowed to
 * distinguish gets a stable machine-readable `code`.
 */

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_NOT_VERIFIED'
  | 'PASSWORD_NOT_SET'
  | 'ACCOUNT_LOCKED'
  | 'ACCOUNT_SUSPENDED'
  | 'INVALID_TOKEN'
  | 'TOKEN_EXPIRED'
  | 'SESSION_EXPIRED'
  | 'TOKEN_REUSE_DETECTED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'OAUTH_ERROR'
  | 'OAUTH_LINK_REQUIRED'
  | 'PROVIDER_NOT_CONFIGURED'
  | 'WEAK_PASSWORD'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace?.(this, AppError);
  }
}

export const badRequest = (code: ErrorCode, message: string, details?: unknown) =>
  new AppError(400, code, message, details);

export const unauthorized = (code: ErrorCode = 'UNAUTHENTICATED', message = 'Not authenticated') =>
  new AppError(401, code, message);

export const forbidden = (code: ErrorCode, message: string) => new AppError(403, code, message);

export const notFound = (message = 'Not found') => new AppError(404, 'NOT_FOUND', message);

export const tooManyRequests = (message = 'Too many requests', details?: unknown) =>
  new AppError(429, 'RATE_LIMITED', message, details);

export const notImplemented = (code: ErrorCode, message: string) =>
  new AppError(501, code, message);
