/**
 * Google + GitHub OAuth — §5.3 of auth-requirements.md.
 *
 * The account-resolution rules in `resolveOAuthUser` are security-critical:
 * auto-linking on an unverified provider email is an account-takeover vector,
 * so we refuse it.
 */

import { GitHub, Google, generateCodeVerifier, generateState } from 'arctic';
import { and, eq, sql } from 'drizzle-orm';

import { env, githubOAuthConfigured, googleOAuthConfigured } from '../config/env.js';
import { db } from '../db/index.js';
import { oauthAccounts, users, type OAuthProvider, type User } from '../db/schema/auth.js';
import { AppError, badRequest, notImplemented } from '../lib/errors.js';
import { logAuthEvent, logger } from '../lib/logger.js';
import { redis } from '../lib/redis.js';

const STATE_TTL_SECONDS = 600; // 10 minutes
const stateKey = (state: string) => `oauth:state:${state}`;

export function callbackUrl(provider: OAuthProvider): string {
  return `${env.BACKEND_URL}${env.API_V1_PREFIX}/auth/oauth/${provider}/callback`;
}

function googleClient(): Google {
  if (!googleOAuthConfigured) {
    throw notImplemented('PROVIDER_NOT_CONFIGURED', 'Google sign-in is not configured');
  }
  return new Google(env.GOOGLE_CLIENT_ID!, env.GOOGLE_CLIENT_SECRET!, callbackUrl('google'));
}

function githubClient(): GitHub {
  if (!githubOAuthConfigured) {
    throw notImplemented('PROVIDER_NOT_CONFIGURED', 'GitHub sign-in is not configured');
  }
  return new GitHub(env.GITHUB_CLIENT_ID!, env.GITHUB_CLIENT_SECRET!, callbackUrl('github'));
}

export function isProviderConfigured(provider: OAuthProvider): boolean {
  return provider === 'google' ? googleOAuthConfigured : githubOAuthConfigured;
}

// ------------------------------------------------------------ authorize

export interface AuthorizeRedirect {
  url: string;
  state: string;
}

/**
 * Build the provider authorization URL. `state` and (for Google) the PKCE
 * verifier are stashed in Redis rather than a cookie so the callback cannot
 * be forged by a client that never started the flow.
 */
export async function buildAuthorizationUrl(
  provider: OAuthProvider,
  opts: { redirectTo?: string } = {},
): Promise<AuthorizeRedirect> {
  const state = generateState();
  let url: URL;
  let codeVerifier: string | null = null;

  if (provider === 'google') {
    codeVerifier = generateCodeVerifier();
    url = googleClient().createAuthorizationURL(state, codeVerifier, ['openid', 'profile', 'email']);
  } else {
    // GitHub needs user:email to read a private primary address.
    url = githubClient().createAuthorizationURL(state, ['read:user', 'user:email']);
  }

  await redis.set(
    stateKey(state),
    JSON.stringify({ provider, codeVerifier, redirectTo: opts.redirectTo ?? null }),
    'EX',
    STATE_TTL_SECONDS,
  );

  return { url: url.toString(), state };
}

interface StoredState {
  provider: OAuthProvider;
  codeVerifier: string | null;
  redirectTo: string | null;
}

/** Read-and-delete the stored state. Single-use by construction. */
async function consumeState(state: string): Promise<StoredState> {
  const raw = await redis.getdel(stateKey(state));
  if (!raw) throw badRequest('OAUTH_ERROR', 'This sign-in link expired or was already used');
  return JSON.parse(raw) as StoredState;
}

// -------------------------------------------------------- profile fetch

export interface ProviderProfile {
  providerAccountId: string;
  email: string | null;
  /** Whether the PROVIDER asserts the email is verified. Drives linking. */
  emailVerified: boolean;
  fullName: string | null;
  avatarUrl: string | null;
}

async function fetchGoogleProfile(accessToken: string): Promise<ProviderProfile> {
  const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw badRequest('OAUTH_ERROR', 'Could not read your Google profile');

  const p = (await res.json()) as {
    sub: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };

  return {
    providerAccountId: p.sub,
    email: p.email?.toLowerCase() ?? null,
    emailVerified: p.email_verified === true,
    fullName: p.name ?? null,
    avatarUrl: p.picture ?? null,
  };
}

async function fetchGithubProfile(accessToken: string): Promise<ProviderProfile> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'iip-backend',
  };

  const userRes = await fetch('https://api.github.com/user', {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (!userRes.ok) throw badRequest('OAUTH_ERROR', 'Could not read your GitHub profile');

  const u = (await userRes.json()) as {
    id: number;
    name?: string | null;
    login: string;
    avatar_url?: string;
  };

  // /user omits the email when the user keeps it private, so always ask
  // /user/emails and take the primary verified one.
  let email: string | null = null;
  let emailVerified = false;

  const emailRes = await fetch('https://api.github.com/user/emails', {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (emailRes.ok) {
    const emails = (await emailRes.json()) as {
      email: string;
      primary: boolean;
      verified: boolean;
    }[];
    const chosen = emails.find((e) => e.primary && e.verified) ?? emails.find((e) => e.verified);
    if (chosen) {
      email = chosen.email.toLowerCase();
      emailVerified = chosen.verified;
    }
  }

  if (!email) {
    throw badRequest(
      'OAUTH_ERROR',
      'Your GitHub account has no verified email address. Add and verify one on GitHub, then try again.',
    );
  }

  return {
    providerAccountId: String(u.id),
    email,
    emailVerified,
    fullName: u.name ?? u.login,
    avatarUrl: u.avatar_url ?? null,
  };
}

// ------------------------------------------------------------- callback

export interface OAuthCallbackResult {
  user: User;
  redirectTo: string | null;
  created: boolean;
}

export async function handleOAuthCallback(params: {
  provider: OAuthProvider;
  code: string;
  state: string;
}): Promise<OAuthCallbackResult> {
  const stored = await consumeState(params.state);
  if (stored.provider !== params.provider) {
    throw badRequest('OAUTH_ERROR', 'Sign-in request did not match. Please try again.');
  }

  let profile: ProviderProfile;
  try {
    if (params.provider === 'google') {
      const tokens = await googleClient().validateAuthorizationCode(
        params.code,
        stored.codeVerifier ?? '',
      );
      profile = await fetchGoogleProfile(tokens.accessToken());
    } else {
      const tokens = await githubClient().validateAuthorizationCode(params.code);
      profile = await fetchGithubProfile(tokens.accessToken());
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.warn({ err, provider: params.provider }, 'oauth code exchange failed');
    throw badRequest('OAUTH_ERROR', 'Sign-in failed. Please try again.');
  }

  const { user, created } = await resolveOAuthUser(params.provider, profile);
  return { user, redirectTo: stored.redirectTo, created };
}

/**
 * Map a provider profile onto a local user, in the priority order defined by
 * spec §5.3.
 */
export async function resolveOAuthUser(
  provider: OAuthProvider,
  profile: ProviderProfile,
): Promise<{ user: User; created: boolean }> {
  // 1. Already linked — identity is (provider, account id), never the email.
  const link = await db.query.oauthAccounts.findFirst({
    where: and(
      eq(oauthAccounts.provider, provider),
      eq(oauthAccounts.providerAccountId, profile.providerAccountId),
    ),
  });

  if (link) {
    const existing = await db.query.users.findFirst({ where: eq(users.id, link.userId) });
    if (existing) {
      logAuthEvent('oauth_login', { userId: existing.id, provider });
      return { user: existing, created: false };
    }
  }

  if (!profile.email) {
    throw badRequest('OAUTH_ERROR', 'Your provider did not return an email address');
  }

  // 2. An account with this email already exists.
  const byEmail = await db.query.users.findFirst({ where: eq(users.email, profile.email) });

  if (byEmail) {
    if (!profile.emailVerified) {
      // Refusing to auto-link here is deliberate: anyone who can set an
      // unverified email at the provider could otherwise claim this account.
      logAuthEvent('oauth_link_refused', { userId: byEmail.id, provider });
      throw new AppError(
        409,
        'OAUTH_LINK_REQUIRED',
        `Your ${provider} email is not verified. Sign in with your password, then link ${provider} from settings.`,
      );
    }

    await db
      .insert(oauthAccounts)
      .values({
        userId: byEmail.id,
        provider,
        providerAccountId: profile.providerAccountId,
      })
      .onConflictDoNothing();

    // Backfill profile fields we did not have, and treat the verified
    // provider email as proof for a still-unverified local account.
    const patch: Partial<typeof users.$inferInsert> = {};
    if (!byEmail.emailVerifiedAt) patch.emailVerifiedAt = new Date();
    if (!byEmail.fullName && profile.fullName) patch.fullName = profile.fullName;
    if (!byEmail.avatarUrl && profile.avatarUrl) patch.avatarUrl = profile.avatarUrl;

    const updated = Object.keys(patch).length
      ? (await db.update(users).set(patch).where(eq(users.id, byEmail.id)).returning())[0]!
      : byEmail;

    logAuthEvent('oauth_linked', { userId: updated.id, provider });
    return { user: updated, created: false };
  }

  // 3. Brand new user. Provider-verified email means no verification mail.
  const inserted = await db
    .insert(users)
    .values({
      email: profile.email,
      passwordHash: null,
      fullName: profile.fullName,
      avatarUrl: profile.avatarUrl,
      emailVerifiedAt: profile.emailVerified ? sql`now()` : null,
    })
    .returning();

  const user = inserted[0]!;
  await db.insert(oauthAccounts).values({
    userId: user.id,
    provider,
    providerAccountId: profile.providerAccountId,
  });

  logAuthEvent('oauth_signup', { userId: user.id, provider });
  return { user, created: true };
}
