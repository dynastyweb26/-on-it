// Stripe server client
// Factory, NOT a module-level singleton: STRIPE_SECRET_KEY is read at call
// time so a missing env var can never crash the build or the import graph
// (dormant path). Returns null when unconfigured -- callers return 503.
import 'server-only';
import Stripe from 'stripe';

// Pinned so a Stripe-side default bump can't silently change request/response
// shapes. Matches the SDK's latest supported version.
export const STRIPE_API_VERSION = '2026-08-26.dahlia' as const;

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { apiVersion: STRIPE_API_VERSION });
}
