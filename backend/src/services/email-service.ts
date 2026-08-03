/**
 * Transactional email via Resend.
 *
 * With RESEND_API_KEY unset (the default in dev) emails are logged to the
 * console instead of sent, including the action URL — so the whole verify and
 * reset flow is exercisable locally without a Resend account.
 */

import { Resend } from 'resend';

import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
}

async function send({ to, subject, html, text }: SendArgs): Promise<void> {
  if (!resend) {
    logger.info({ to, subject, preview: text.slice(0, 500) }, '[email:dev] not sent — RESEND_API_KEY unset');
    return;
  }
  try {
    const { error } = await resend.emails.send({ from: env.EMAIL_FROM, to, subject, html, text });
    if (error) logger.error({ err: error, to, subject }, 'resend rejected email');
  } catch (err) {
    // Never let an email failure break the request that triggered it — the
    // user can always re-request a verification or reset link.
    logger.error({ err, to, subject }, 'failed to send email');
  }
}

function layout(heading: string, body: string, cta?: { label: string; url: string }): string {
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f6f7f9;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#111">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px">
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:600">${heading}</h1>
    <div style="font-size:15px;line-height:1.6;color:#374151">${body}</div>
    ${
      cta
        ? `<p style="margin:28px 0"><a href="${cta.url}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:15px;font-weight:500">${cta.label}</a></p>
           <p style="font-size:13px;color:#6b7280;word-break:break-all">Or paste this link into your browser:<br>${cta.url}</p>`
        : ''
    }
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0">
    <p style="font-size:12px;color:#9ca3af;margin:0">Internet Intelligence Platform</p>
  </div>
</body></html>`;
}

export async function sendVerificationEmail(to: string, rawToken: string): Promise<void> {
  const url = `${env.FRONTEND_URL}/verify?token=${encodeURIComponent(rawToken)}`;
  await send({
    to,
    subject: 'Verify your email address',
    html: layout(
      'Verify your email',
      `<p>Confirm this address to activate your account. This link expires in ${env.EMAIL_VERIFY_TTL_HOURS} hours.</p>`,
      { label: 'Verify email', url },
    ),
    text: `Verify your email address:\n\n${url}\n\nThis link expires in ${env.EMAIL_VERIFY_TTL_HOURS} hours.`,
  });
}

export async function sendPasswordResetEmail(to: string, rawToken: string): Promise<void> {
  const url = `${env.FRONTEND_URL}/reset-password?token=${encodeURIComponent(rawToken)}`;
  await send({
    to,
    subject: 'Reset your password',
    html: layout(
      'Reset your password',
      `<p>Choose a new password using the button below. This link expires in ${env.PASSWORD_RESET_TTL_HOURS} hour(s) and can be used once.</p>
       <p>If you did not request this, you can ignore this email — your password will not change.</p>`,
      { label: 'Reset password', url },
    ),
    text: `Reset your password:\n\n${url}\n\nExpires in ${env.PASSWORD_RESET_TTL_HOURS} hour(s). If you did not request this, ignore this email.`,
  });
}

/**
 * Sent when someone tries to sign up with an address that already has an
 * account. This is what lets /signup return an identical response for both
 * cases without silently swallowing a real user's intent.
 */
export async function sendDuplicateSignupEmail(to: string): Promise<void> {
  const url = `${env.FRONTEND_URL}/login`;
  await send({
    to,
    subject: 'Someone tried to sign up with your email',
    html: layout(
      'You already have an account',
      `<p>Someone just tried to create an account with this email address. You already have one, so we did not create a second.</p>
       <p>If this was you, sign in below — or reset your password if you have forgotten it.</p>`,
      { label: 'Sign in', url },
    ),
    text: `Someone tried to sign up with this email, but you already have an account.\n\nSign in: ${url}`,
  });
}

export async function sendAccountLockedEmail(to: string, minutes: number): Promise<void> {
  await send({
    to,
    subject: 'Your account was temporarily locked',
    html: layout(
      'Account temporarily locked',
      `<p>We saw too many failed sign-in attempts, so we locked your account for ${minutes} minutes.</p>
       <p>If this was not you, reset your password once the lock expires.</p>`,
    ),
    text: `Too many failed sign-in attempts. Your account is locked for ${minutes} minutes.`,
  });
}
