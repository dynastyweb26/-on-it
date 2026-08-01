// ═══ Resend server client ═══
// Factory, NOT a module-level singleton (same shape as getStripe): RESEND_API_KEY
// is read at call time so a missing env var can never crash the build or the
// import graph. Returns null when unconfigured — callers no-op (dormant path),
// exactly like the Stripe/billing routes stay dormant until keys are present.
//
// Server-only: transactional email is sent from route handlers / crons. The API
// key must never reach the client bundle.
import 'server-only';
import { Resend } from 'resend';

export function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

// Verified sender for On It transactional mail. Overridable via env; the default
// points at the On It subdomain (must be verified in Resend before it delivers).
export function emailFrom(): string {
  return process.env.RESEND_FROM ?? 'On It <billing@onit.dynastyweb.co>';
}
