/**
 * Access-token issuing and verification (HS256 via `jose`).
 *
 * Access tokens are stateless and NOT revocable — that is the accepted
 * tradeoff documented in §3.3 of the spec. A logged-out user's token stays
 * valid until it expires (≤15 min).
 */

import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { randomUUID } from 'node:crypto';

import { env } from '../config/env.js';
import type { Plan } from '../db/schema/auth.js';

const secret = new TextEncoder().encode(env.JWT_SECRET);
const ALG = 'HS256';
const ISSUER = 'iip-api';
const AUDIENCE = 'iip-app';

export interface AccessTokenClaims extends JWTPayload {
  sub: string;
  email: string;
  /** Embedded so quota middleware needs no DB read. Staleness ≤ token TTL. */
  plan: Plan;
  jti: string;
}

export async function signAccessToken(params: {
  userId: string;
  email: string;
  plan: Plan;
}): Promise<{ token: string; expiresIn: number }> {
  const expiresIn = env.ACCESS_TOKEN_TTL_MINUTES * 60;

  const token = await new SignJWT({
    email: params.email,
    plan: params.plan,
  })
    .setProtectedHeader({ alg: ALG })
    .setSubject(params.userId)
    .setJti(randomUUID())
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime(`${expiresIn}s`)
    .sign(secret);

  return { token, expiresIn };
}

/** Returns the claims, or null if the token is invalid/expired/tampered. */
export async function verifyAccessToken(token: string): Promise<AccessTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: [ALG], // pinned — prevents alg-confusion attacks
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    return payload as AccessTokenClaims;
  } catch {
    return null;
  }
}
