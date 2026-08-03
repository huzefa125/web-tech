/**
 * Auth routes — the endpoint table in §4 of auth-requirements.md.
 *
 * Express 5 forwards async rejections to the error handler automatically, so
 * handlers here throw rather than try/catch.
 */

import { Router, type Request, type Response } from 'express';

import { env } from '../../config/env.js';
import type { OAuthProvider } from '../../db/schema/auth.js';
import { badRequest, notFound, unauthorized } from '../../lib/errors.js';
import { signAccessToken } from '../../lib/jwt.js';
import { logAuthEvent } from '../../lib/logger.js';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  oauthProviderSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  sessionIdSchema,
  signupSchema,
  updateProfileSchema,
  verifyEmailSchema,
} from '../../schemas/auth.js';
import * as authService from '../../services/auth-service.js';
import {
  buildAuthorizationUrl,
  handleOAuthCallback,
  isProviderConfigured,
} from '../../services/oauth-service.js';
import * as tokenService from '../../services/token-service.js';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from '../cookies.js';
import { requireAuth } from '../middleware/authenticate.js';
import {
  forgotPasswordLimiter,
  generalAuthLimiter,
  loginLimiter,
  refreshLimiter,
  resendVerificationLimiter,
  signupLimiter,
} from '../middleware/rate-limit.js';

export const authRouter = Router();

function sessionContext(req: Request) {
  return { userAgent: req.get('user-agent') ?? undefined, ip: req.ip ?? undefined };
}

/** Issue an access token and set the rotating refresh cookie. */
async function establishSession(
  res: Response,
  req: Request,
  user: { id: string; email: string; plan: 'free' | 'pro' | 'team' | 'enterprise' },
) {
  const refresh = await tokenService.issueRefreshToken(user.id, sessionContext(req));
  setRefreshCookie(res, refresh.raw, refresh.expiresAt);
  return signAccessToken({ userId: user.id, email: user.email, plan: user.plan });
}

// ------------------------------------------------------------- signup

authRouter.post('/signup', signupLimiter, async (req, res) => {
  const input = signupSchema.parse(req.body);
  const { user } = await authService.signup(input);

  // Identical response whether or not the email was taken (spec §4).
  res.status(201).json({
    message: 'Account created. Check your email for a verification link.',
    user,
  });
});

// -------------------------------------------------------------- login

authRouter.post('/login', loginLimiter, async (req, res) => {
  const input = loginSchema.parse(req.body);
  const user = await authService.login({ ...input, ip: req.ip });
  const { token, expiresIn } = await establishSession(res, req, user);

  res.json({
    accessToken: token,
    expiresIn,
    user: authService.toPublicUser(user),
  });
});

// ------------------------------------------------------------ refresh

authRouter.post('/refresh', refreshLimiter, async (req, res) => {
  const raw = readRefreshCookie(req.cookies);
  if (!raw) throw unauthorized('INVALID_TOKEN', 'No refresh token');

  let result;
  try {
    result = await tokenService.rotateRefreshToken(raw, sessionContext(req));
  } catch (err) {
    // Any rotation failure ends the session — drop the cookie so the browser
    // stops replaying a dead token.
    clearRefreshCookie(res);
    throw err;
  }

  const user = await authService.findUserById(result.userId);
  if (!user || user.status !== 'active') {
    clearRefreshCookie(res);
    throw unauthorized('UNAUTHENTICATED', 'Account is no longer active');
  }

  setRefreshCookie(res, result.next.raw, result.next.expiresAt);
  const { token, expiresIn } = await signAccessToken({
    userId: user.id,
    email: user.email,
    plan: user.plan,
  });

  res.json({ accessToken: token, expiresIn, user: authService.toPublicUser(user) });
});

// ------------------------------------------------------------- logout

authRouter.post('/logout', async (req, res) => {
  const raw = readRefreshCookie(req.cookies);
  if (raw) await tokenService.revokeByRawToken(raw);
  clearRefreshCookie(res);
  res.status(204).send();
});

authRouter.post('/logout-all', requireAuth, async (req, res) => {
  const count = await tokenService.revokeAllForUser(req.user!.id);
  clearRefreshCookie(res);
  logAuthEvent('logout_all', { userId: req.user!.id, sessionsRevoked: count });
  res.status(204).send();
});

// ---------------------------------------------------------------- me

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await authService.findUserById(req.user!.id);
  if (!user) throw notFound('User not found');
  res.json({ user: authService.toPublicUser(user) });
});

authRouter.patch('/me', requireAuth, generalAuthLimiter, async (req, res) => {
  const patch = updateProfileSchema.parse(req.body);
  const user = await authService.updateProfile(req.user!.id, patch);
  res.json({ user: authService.toPublicUser(user) });
});

// ------------------------------------------------------ email verification

authRouter.post('/verify-email', generalAuthLimiter, async (req, res) => {
  const { token } = verifyEmailSchema.parse(req.body);
  await authService.verifyEmail(token);
  res.status(204).send();
});

authRouter.post('/verify-email/resend', resendVerificationLimiter, async (req, res) => {
  const { email } = resendVerificationSchema.parse(req.body);
  await authService.resendVerification(email);
  // Always 202 — never reveals whether the address exists or is verified.
  res.status(202).json({ message: 'If that address needs verification, we sent a new link.' });
});

// ---------------------------------------------------------- password

authRouter.post('/password/forgot', forgotPasswordLimiter, async (req, res) => {
  const { email } = forgotPasswordSchema.parse(req.body);
  await authService.requestPasswordReset(email);
  res.status(202).json({ message: 'If that account exists, we sent a reset link.' });
});

authRouter.post('/password/reset', generalAuthLimiter, async (req, res) => {
  const { token, newPassword } = resetPasswordSchema.parse(req.body);
  await authService.resetPassword(token, newPassword);
  clearRefreshCookie(res);
  res.status(204).send();
});

authRouter.post('/password/change', requireAuth, generalAuthLimiter, async (req, res) => {
  const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
  await authService.changePassword(req.user!.id, currentPassword, newPassword);

  // Kill every other session, then re-establish this one so the caller stays
  // signed in on the device they just used.
  await tokenService.revokeAllForUser(req.user!.id);
  const user = await authService.findUserById(req.user!.id);
  if (user) {
    const refresh = await tokenService.issueRefreshToken(user.id, sessionContext(req));
    setRefreshCookie(res, refresh.raw, refresh.expiresAt);
  }
  res.status(204).send();
});

// ------------------------------------------------------------- sessions

authRouter.get('/sessions', requireAuth, async (req, res) => {
  res.json({ sessions: await tokenService.listActiveSessions(req.user!.id) });
});

authRouter.delete('/sessions/:id', requireAuth, async (req, res) => {
  const sessionId = sessionIdSchema.safeParse(param(req.params.id));
  if (!sessionId.success) throw notFound('Session not found');
  const ok = await tokenService.revokeSession(req.user!.id, sessionId.data);
  if (!ok) throw notFound('Session not found');
  res.status(204).send();
});

// ---------------------------------------------------------------- OAuth

/** Express 5 types route params as `string | string[]`; narrow to a scalar. */
function param(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseProvider(value: string | string[] | undefined): OAuthProvider {
  const parsed = oauthProviderSchema.safeParse(param(value));
  if (!parsed.success) throw notFound('Unknown provider');
  return parsed.data;
}

authRouter.get('/oauth/:provider', generalAuthLimiter, async (req, res) => {
  const provider = parseProvider(req.params.provider);
  if (!isProviderConfigured(provider)) {
    throw badRequest('PROVIDER_NOT_CONFIGURED', `${provider} sign-in is not configured`);
  }

  const redirectTo = typeof req.query.redirect_to === 'string' ? req.query.redirect_to : undefined;
  const { url } = await buildAuthorizationUrl(provider, { redirectTo });
  res.redirect(url);
});

authRouter.get('/oauth/:provider/callback', generalAuthLimiter, async (req, res) => {
  const provider = parseProvider(req.params.provider);
  const { code, state, error: providerError } = req.query;

  const fail = (code: string, message: string) =>
    res.redirect(
      `${env.FRONTEND_URL}/auth/callback?error=${encodeURIComponent(code)}&message=${encodeURIComponent(message)}`,
    );

  if (typeof providerError === 'string') {
    return fail('OAUTH_ERROR', 'Sign-in was cancelled.');
  }
  if (typeof code !== 'string' || typeof state !== 'string') {
    return fail('OAUTH_ERROR', 'Malformed sign-in response.');
  }

  let result;
  try {
    result = await handleOAuthCallback({ provider, code, state });
  } catch (err) {
    // OAuth failures land in the browser, not in fetch(), so redirect with an
    // error rather than returning JSON the user would see as raw text.
    const message = err instanceof Error ? err.message : 'Sign-in failed.';
    const errorCode =
      typeof (err as { code?: string }).code === 'string'
        ? (err as { code: string }).code
        : 'OAUTH_ERROR';
    return fail(errorCode, message);
  }

  const refresh = await tokenService.issueRefreshToken(result.user.id, sessionContext(req));
  setRefreshCookie(res, refresh.raw, refresh.expiresAt);

  const target = new URL('/auth/callback', env.FRONTEND_URL);
  if (result.redirectTo) target.searchParams.set('redirect_to', result.redirectTo);
  if (result.created) target.searchParams.set('welcome', '1');
  res.redirect(target.toString());
});
