/**
 * Auth schema — users, linked OAuth accounts, refresh tokens, one-time tokens.
 * Mirrors §2 of auth-requirements.md.
 */

import { sql } from 'drizzle-orm';
import {
  customType,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/**
 * Postgres CITEXT. Gives case-insensitive uniqueness at the database level, so
 * "Foo@bar.com" and "foo@bar.com" cannot both exist — enforced by the engine
 * rather than by remembering to .toLowerCase() at every call site.
 */
const citext = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'citext';
  },
});

export const PLANS = ['free', 'pro', 'team', 'enterprise'] as const;
export const USER_STATUSES = ['active', 'suspended', 'deleted'] as const;
export const OAUTH_PROVIDERS = ['google', 'github'] as const;
export const TOKEN_PURPOSES = ['email_verify', 'password_reset'] as const;

export type Plan = (typeof PLANS)[number];
export type UserStatus = (typeof USER_STATUSES)[number];
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];
export type TokenPurpose = (typeof TOKEN_PURPOSES)[number];

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: citext('email').notNull(),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    /** NULL for OAuth-only accounts — see §5.5 of the spec. */
    passwordHash: text('password_hash'),
    fullName: varchar('full_name', { length: 255 }),
    avatarUrl: text('avatar_url'),

    /** Denormalised onto the user so quota middleware needs no join. */
    plan: varchar('plan', { length: 20 }).notNull().default('free').$type<Plan>(),
    status: varchar('status', { length: 20 }).notNull().default('active').$type<UserStatus>(),

    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    failedLoginCount: integer('failed_login_count').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('uq_users_email').on(t.email)],
);

export const oauthAccounts = pgTable(
  'oauth_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 20 }).notNull().$type<OAuthProvider>(),
    /** The provider's stable account id — never the email, which is mutable. */
    providerAccountId: varchar('provider_account_id', { length: 255 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_oauth_provider_account').on(t.provider, t.providerAccountId),
    index('ix_oauth_accounts_user').on(t.userId),
  ],
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** SHA-256 of the raw token. The raw value only ever lives in the cookie. */
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    /** Rotation lineage. Replaying a revoked token revokes the whole family. */
    familyId: uuid('family_id').notNull(),

    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),

    userAgent: varchar('user_agent', { length: 512 }),
    ip: varchar('ip', { length: 45 }), // IPv6-safe
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_refresh_tokens_hash').on(t.tokenHash),
    index('ix_refresh_tokens_user_active').on(t.userId, t.revokedAt),
    index('ix_refresh_tokens_family').on(t.familyId),
    index('ix_refresh_tokens_expires').on(t.expiresAt),
  ],
);

export const verificationTokens = pgTable(
  'verification_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    purpose: varchar('purpose', { length: 30 }).notNull().$type<TokenPurpose>(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_verification_tokens_hash').on(t.tokenHash),
    index('ix_verification_tokens_user_purpose').on(t.userId, t.purpose),
    index('ix_verification_tokens_expires').on(t.expiresAt),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type OAuthAccount = typeof oauthAccounts.$inferSelect;
export type RefreshToken = typeof refreshTokens.$inferSelect;
export type VerificationToken = typeof verificationTokens.$inferSelect;

/** Fields safe to return to a client. Never spread a raw User into a response. */
export const publicUserColumns = {
  id: users.id,
  email: users.email,
  emailVerifiedAt: users.emailVerifiedAt,
  fullName: users.fullName,
  avatarUrl: users.avatarUrl,
  plan: users.plan,
  status: users.status,
  createdAt: users.createdAt,
  lastLoginAt: users.lastLoginAt,
};

export const nowSql = sql`now()`;
