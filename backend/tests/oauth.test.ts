/**
 * OAuth account resolution — §5.3. These exercise `resolveOAuthUser`
 * directly rather than driving a real provider round-trip, so the linking
 * rules are tested without network access or live client credentials.
 */

import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { db } from '../src/db/index.js';
import { oauthAccounts, users } from '../src/db/schema/auth.js';
import { AppError } from '../src/lib/errors.js';
import { resolveOAuthUser, type ProviderProfile } from '../src/services/oauth-service.js';
import { AUTH, api, createUnverifiedUser, createUser, getUserByEmail } from './helpers.js';

function profile(over: Partial<ProviderProfile> = {}): ProviderProfile {
  return {
    providerAccountId: '12345',
    email: 'oauth-user@example.com',
    emailVerified: true,
    fullName: 'OAuth User',
    avatarUrl: 'https://example.com/a.png',
    ...over,
  };
}

describe('resolveOAuthUser', () => {
  it('creates a new, already-verified user on first sign-in', async () => {
    const { user, created } = await resolveOAuthUser('google', profile());

    expect(created).toBe(true);
    expect(user.email).toBe('oauth-user@example.com');
    expect(user.emailVerifiedAt).not.toBeNull();
    // OAuth-only accounts have no password.
    expect(user.passwordHash).toBeNull();
  });

  it('links the provider account row on creation', async () => {
    const { user } = await resolveOAuthUser('github', profile({ providerAccountId: '999' }));

    const links = await db.select().from(oauthAccounts).where(eq(oauthAccounts.userId, user.id));
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ provider: 'github', providerAccountId: '999' });
  });

  it('returns the same user on a second sign-in', async () => {
    const first = await resolveOAuthUser('google', profile());
    const second = await resolveOAuthUser('google', profile());

    expect(second.created).toBe(false);
    expect(second.user.id).toBe(first.user.id);
  });

  it('matches on provider account id, not email', async () => {
    const first = await resolveOAuthUser('google', profile({ providerAccountId: 'stable-id' }));

    // The user changed their email at Google; the account id is unchanged.
    const second = await resolveOAuthUser(
      'google',
      profile({ providerAccountId: 'stable-id', email: 'new-address@example.com' }),
    );

    expect(second.user.id).toBe(first.user.id);
  });

  it('links to an existing local account when the provider email is verified', async () => {
    const existing = await createUser({ email: 'shared@example.com' });

    const { user, created } = await resolveOAuthUser(
      'google',
      profile({ email: 'shared@example.com', emailVerified: true }),
    );

    expect(created).toBe(false);
    expect(user.id).toBe(existing.id);

    const links = await db.select().from(oauthAccounts).where(eq(oauthAccounts.userId, user.id));
    expect(links).toHaveLength(1);
  });

  it('REFUSES to auto-link when the provider email is unverified', async () => {
    // Auto-linking here would let anyone who can set an unverified email at
    // the provider take over this account.
    await createUser({ email: 'target@example.com' });

    await expect(
      resolveOAuthUser('github', profile({ email: 'target@example.com', emailVerified: false })),
    ).rejects.toMatchObject({ code: 'OAUTH_LINK_REQUIRED' });
  });

  it('does not create an account when linking is refused', async () => {
    await createUser({ email: 'target2@example.com' });

    await expect(
      resolveOAuthUser('github', profile({ email: 'target2@example.com', emailVerified: false })),
    ).rejects.toBeInstanceOf(AppError);

    const all = await db.select().from(users).where(eq(users.email, 'target2@example.com'));
    expect(all).toHaveLength(1);
  });

  it('verifies a previously unverified local account when linking', async () => {
    const existing = await createUser({ email: 'unv@example.com', emailVerifiedAt: null });

    const { user } = await resolveOAuthUser(
      'google',
      profile({ email: 'unv@example.com', emailVerified: true }),
    );

    expect(user.id).toBe(existing.id);
    expect(user.emailVerifiedAt).not.toBeNull();
  });

  it('backfills a missing name and avatar but does not overwrite existing ones', async () => {
    await createUser({ email: 'partial@example.com', fullName: 'Existing Name', avatarUrl: null });

    const { user } = await resolveOAuthUser(
      'google',
      profile({ email: 'partial@example.com', fullName: 'Provider Name', avatarUrl: 'https://x/y.png' }),
    );

    expect(user.fullName).toBe('Existing Name');
    expect(user.avatarUrl).toBe('https://x/y.png');
  });

  it('supports linking both providers to one account', async () => {
    const { user } = await resolveOAuthUser('google', profile({ providerAccountId: 'g1' }));
    await resolveOAuthUser('github', profile({ providerAccountId: 'gh1' }));

    const links = await db.select().from(oauthAccounts).where(eq(oauthAccounts.userId, user.id));
    expect(links.map((l) => l.provider).sort()).toEqual(['github', 'google']);
  });

  it('rejects a profile with no email', async () => {
    await expect(
      resolveOAuthUser('github', profile({ email: null })),
    ).rejects.toMatchObject({ code: 'OAUTH_ERROR' });
  });

  it('leaves a new user unverified if the provider says the email is unverified', async () => {
    const { user } = await resolveOAuthUser(
      'github',
      profile({ email: 'brand-new@example.com', emailVerified: false }),
    );
    expect(user.emailVerifiedAt).toBeNull();
    expect(await getUserByEmail('brand-new@example.com')).toBeDefined();
  });
});

describe('OAuth routes', () => {
  it('returns a clear error when the provider is not configured', async () => {
    // No client id/secret set in the test env.
    const res = await api().get(`${AUTH}/oauth/google`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PROVIDER_NOT_CONFIGURED');
  });

  it('404s on an unknown provider', async () => {
    const res = await api().get(`${AUTH}/oauth/myspace`);
    expect(res.status).toBe(404);
  });

  it('redirects to the frontend with an error when the user cancels', async () => {
    const res = await api().get(`${AUTH}/oauth/google/callback?error=access_denied`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/auth/callback?error=');
  });

  it('redirects with an error on a malformed callback', async () => {
    const res = await api().get(`${AUTH}/oauth/github/callback`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('error=OAUTH_ERROR');
  });

  it('rejects a callback whose state was never issued', async () => {
    const res = await api().get(`${AUTH}/oauth/google/callback?code=abc&state=never-issued`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('error=');
  });
});

describe('resolveOAuthUser account status', () => {
  it('refuses a suspended user signing in through an already-linked provider', async () => {
    const user = await createUser({ email: 'susp-linked@example.com', status: 'suspended' });
    await db.insert(oauthAccounts).values({
      userId: user.id,
      provider: 'google',
      providerAccountId: 'susp-1',
    });

    await expect(
      resolveOAuthUser('google', profile({ providerAccountId: 'susp-1', email: user.email })),
    ).rejects.toMatchObject({ statusCode: 403, code: 'ACCOUNT_SUSPENDED' });
  });

  it('refuses a deleted user without confirming the account exists', async () => {
    const user = await createUser({ email: 'gone@example.com', status: 'deleted' });
    await db.insert(oauthAccounts).values({
      userId: user.id,
      provider: 'github',
      providerAccountId: 'gone-1',
    });

    await expect(
      resolveOAuthUser('github', profile({ providerAccountId: 'gone-1', email: user.email })),
    ).rejects.toMatchObject({ statusCode: 401, code: 'INVALID_CREDENTIALS' });
  });

  it('does not link or mutate a suspended account reached by email', async () => {
    const user = await createUnverifiedUser({ email: 'susp-link@example.com', status: 'suspended' });

    await expect(
      resolveOAuthUser('google', profile({ providerAccountId: 'susp-2', email: user.email })),
    ).rejects.toBeInstanceOf(AppError);

    // The link is refused before any write — no oauth row, and the account is
    // not silently marked verified by the attempt.
    const links = await db
      .select()
      .from(oauthAccounts)
      .where(eq(oauthAccounts.userId, user.id));
    expect(links).toHaveLength(0);

    const after = await getUserByEmail(user.email);
    expect(after?.emailVerifiedAt).toBeNull();
  });

  it('still admits an active user on the same paths', async () => {
    const user = await createUser({ email: 'active-oauth@example.com' });
    const { user: resolved } = await resolveOAuthUser(
      'google',
      profile({ providerAccountId: 'active-1', email: user.email }),
    );
    expect(resolved.id).toBe(user.id);
  });
});
