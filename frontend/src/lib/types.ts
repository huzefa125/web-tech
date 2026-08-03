/**
 * Shapes returned by the backend.
 *
 * auth-requirements.md §7 wants the frontend importing the backend's Zod
 * schemas directly so the two cannot drift. That needs a shared workspace
 * package; until the monorepo is wired, these are hand-mirrored and this file
 * is the single place drift can hide.
 */

export type Plan = 'free' | 'pro' | 'team' | 'enterprise';

export type ScanStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface User {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  plan: Plan;
  emailVerified: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AuthSession {
  accessToken: string;
  expiresIn: number;
  user: User;
}

export interface ScanSummary {
  id: string;
  status: ScanStatus;
  host: string;
  finalUrl: string | null;
  httpStatus: number | null;
  loadTimeMs: number | null;
  errorCode: string | null;
  queuedAt: string;
  finishedAt: string | null;
}

export interface ScanAsset {
  id: string;
  kind: 'html' | 'css' | 'js';
  url: string;
  byteSize: number;
  contentType: string | null;
}

export interface ScanDetail {
  scan: {
    id: string;
    status: ScanStatus;
    host: string;
    finalUrl: string | null;
    httpStatus: number | null;
    responseHeaders: Record<string, string> | null;
    loadTimeMs: number | null;
    errorCode: string | null;
    errorMessage: string | null;
    queuedAt: string;
    startedAt: string | null;
    finishedAt: string | null;
  };
  assets: ScanAsset[];
  screenshot: { id: string; width: number; height: number; byteSize: number } | null;
}

export interface Quota {
  plan: Plan;
  limit: number | null;
  used: number;
  remaining: number | null;
}

/** Stable machine codes from the backend's error contract. */
export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_NOT_VERIFIED'
  | 'PASSWORD_NOT_SET'
  | 'ACCOUNT_LOCKED'
  | 'ACCOUNT_SUSPENDED'
  | 'INVALID_TOKEN'
  | 'SESSION_EXPIRED'
  | 'TOKEN_REUSE_DETECTED'
  | 'UNAUTHENTICATED'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'OAUTH_ERROR'
  | 'OAUTH_LINK_REQUIRED'
  | 'PROVIDER_NOT_CONFIGURED'
  | 'WEAK_PASSWORD'
  | 'INTERNAL_ERROR';
