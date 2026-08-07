/**
 * API client.
 *
 * The important part of this file is `refreshOnce`. auth-requirements.md §7
 * calls the concurrent-refresh bug "the most common bug in this design", and
 * it is a real one: the backend rotates the refresh token on every use and
 * treats a replayed token as theft, revoking the entire family. So if a page
 * fires three requests that all 401 and each calls /auth/refresh, the first
 * rotates the token and the other two present the now-revoked one — the user
 * is logged out by their own client.
 *
 * Every caller therefore shares ONE in-flight refresh promise.
 */

import type { AuthSession, ErrorCode, Quota, ScanDetail, ScanSummary, User } from './types';

const BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1').replace(
  /\/$/,
  '',
);

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * In-memory access token. Deliberately not localStorage: §3.1 keeps it out of
 * any store XSS can read, and a reload recovers it from the refresh cookie.
 */
let accessToken: string | null = null;
let onSessionLost: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/** Called when the session cannot be recovered, so the app can redirect. */
export function setSessionLostHandler(fn: (() => void) | null): void {
  onSessionLost = fn;
}

async function parseError(res: Response): Promise<ApiError> {
  let code = 'INTERNAL_ERROR';
  let message = res.statusText || 'Request failed';
  let details: unknown;

  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string; details?: unknown } };
    if (body.error) {
      code = body.error.code ?? code;
      message = body.error.message ?? message;
      details = body.error.details;
    }
  } catch {
    // Non-JSON error body (a proxy 502, say). Keep the status text.
  }

  return new ApiError(res.status, code, message, details);
}

// ------------------------------------------------------------------ refresh

let refreshInFlight: Promise<AuthSession | null> | null = null;

/**
 * Exchange the refresh cookie for a new access token, at most once at a time.
 *
 * Returns the new session, or null when it is genuinely over. Never throws:
 * callers treat null as "logged out", and a rejected promise here would have
 * to be handled identically at every call site.
 */
function refreshOnce(): Promise<AuthSession | null> {
  refreshInFlight ??= (async () => {
    try {
      const res = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!res.ok) {
        accessToken = null;
        return null;
      }

      const session = (await res.json()) as AuthSession;
      accessToken = session.accessToken;
      return session;
    } catch {
      // A network failure is not proof the session died; the caller retries.
      return null;
    } finally {
      // Cleared in a microtask so callers already awaiting this promise
      // resolve from it rather than starting a second refresh.
      queueMicrotask(() => {
        refreshInFlight = null;
      });
    }
  })();

  return refreshInFlight;
}

/**
 * Recover a session on app mount (§7). Shares the same in-flight promise as
 * the 401 path — mount and a first render's queries can otherwise race, which
 * is exactly the rotation collision this design has to avoid.
 */
export async function restoreSession(): Promise<User | null> {
  return (await refreshOnce())?.user ?? null;
}

// -------------------------------------------------------------------- core

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Set for endpoints that must not trigger a refresh (login, refresh itself). */
  skipAuth?: boolean;
  /** Internal: prevents an infinite refresh→retry→refresh loop. */
  isRetry?: boolean;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, skipAuth, isRetry, headers, ...rest } = options;

  const finalHeaders = new Headers(headers);
  if (body !== undefined && !finalHeaders.has('Content-Type')) {
    finalHeaders.set('Content-Type', 'application/json');
  }
  if (!skipAuth && accessToken) {
    finalHeaders.set('Authorization', `Bearer ${accessToken}`);
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...rest,
    headers: finalHeaders,
    credentials: 'include',
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (res.status === 401 && !skipAuth && !isRetry) {
    const fresh = await refreshOnce();
    if (fresh) return request<T>(path, { ...options, isRetry: true });

    onSessionLost?.();
    throw await parseError(res);
  }

  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;

  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return (await res.blob()) as T;

  return (await res.json()) as T;
}

// ------------------------------------------------------------------- calls

export const api = {
  // ---- auth ----
  signup: (input: { email: string; password: string; fullName?: string }) =>
    request<{ message: string; user: User | null }>('/auth/signup', {
      method: 'POST',
      body: input,
      skipAuth: true,
    }),

  login: (input: { email: string; password: string }) =>
    request<AuthSession>('/auth/login', { method: 'POST', body: input, skipAuth: true }),

  logout: () => request<void>('/auth/logout', { method: 'POST', skipAuth: true }),

  logoutAll: () => request<void>('/auth/logout-all', { method: 'POST' }),

  me: () => request<{ user: User }>('/auth/me'),

  verifyEmail: (token: string) =>
    request<void>('/auth/verify-email', { method: 'POST', body: { token }, skipAuth: true }),

  resendVerification: (email: string) =>
    request<{ message: string }>('/auth/verify-email/resend', {
      method: 'POST',
      body: { email },
      skipAuth: true,
    }),

  forgotPassword: (email: string) =>
    request<{ message: string }>('/auth/password/forgot', {
      method: 'POST',
      body: { email },
      skipAuth: true,
    }),

  resetPassword: (token: string, newPassword: string) =>
    request<void>('/auth/password/reset', {
      method: 'POST',
      body: { token, newPassword },
      skipAuth: true,
    }),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<void>('/auth/password/change', {
      method: 'POST',
      body: { currentPassword, newPassword },
    }),

  oauthUrl: (provider: 'google' | 'github', redirectTo?: string) => {
    const url = new URL(`${BASE_URL}/auth/oauth/${provider}`);
    if (redirectTo) url.searchParams.set('redirect_to', redirectTo);
    return url.toString();
  },

  // ---- scans ----
  createScan: (url: string) =>
    request<{ scan: { id: string; status: string; host: string; queuedAt: string } }>('/scans', {
      method: 'POST',
      body: { url },
    }),

  listScans: (limit = 20, offset = 0) =>
    request<{ scans: ScanSummary[] }>(`/scans?limit=${limit}&offset=${offset}`),

  getScan: (id: string) => request<ScanDetail>(`/scans/${id}`),

  quota: () => request<Quota>('/scans/quota'),

};

export { BASE_URL };
