// ═══ Stripe Connect (Accounts v2, merchant configuration, direct charges) ═══
// Sellers connect their OWN Stripe account (full Stripe Dashboard — the v2
// equivalent of a Standard account); their clients pay them directly. We never
// take an application fee. This module holds the shared server-side pieces the
// /api/connect/* routes (and, later, the Connect webhook) use.
//
// Accounts v1 (`accounts.create({ type: 'standard' })`) is rejected for new
// Connect integrations, so creation, links, and status all go through
// stripe.v2.core.*. Direct charges still use the v1 Checkout API with the
// Stripe-Account header (stripeContext) against the same acct_ id.
//
// The stripe_* profile columns are NOT granted to authenticated (migration
// 20260925000000 / 20260925000001), so every write here goes through the
// service-role admin client. Callers are responsible for authenticating the
// user first.
import 'server-only';
import type Stripe from 'stripe';
import { adminClient } from '@/lib/supabase/admin';

/**
 * Connect is dark until explicitly switched on per environment. Preview runs
 * sandbox keys with Connect configured; Production runs live keys and stays
 * off until the live Connect platform profile is complete. Routes return 503
 * (the same dormant contract as checkout/billing-portal) when this is false.
 */
export function connectEnabled(): boolean {
  return process.env.STRIPE_CONNECT_ENABLED?.trim() === 'true';
}

/** Idempotency key for account creation. `v2` prefix: can't collide with any
 *  v1 attempt Stripe cached under the old `connect-account-` key. */
export const accountIdempotencyKey = (userId: string) => `connect-v2-account-${userId}`;

/** What the routes ask Stripe to include on create/retrieve — status needs both. */
export const ACCOUNT_INCLUDE: Stripe.V2.Core.AccountRetrieveParams.Include[] = [
  'configuration.merchant',
  'requirements',
];

type V2Account = Stripe.V2.Core.Account;
type CapabilityStatus = 'active' | 'pending' | 'restricted' | 'unsupported';

export interface ConnectStatus {
  accountId: string;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
  payoutsEnabled: boolean;
}

/** Raw capability statuses — safe to log (no requirement text, no PII). */
export interface CapabilityStatuses {
  cardPayments: CapabilityStatus | null;
  payouts: CapabilityStatus | null;
}

export function capabilityStatuses(account: V2Account): CapabilityStatuses {
  const caps = account.configuration?.merchant?.capabilities;
  return {
    cardPayments: caps?.card_payments?.status ?? null,
    payouts: caps?.stripe_balance?.payouts?.status ?? null,
  };
}

/**
 * v2 → the profile's status columns (column meanings unchanged from v1):
 *   chargesEnabled   ← merchant card_payments capability is 'active'
 *                      (drives the Connected badge)
 *   payoutsEnabled   ← merchant stripe_balance.payouts capability is 'active'
 *                      (drives the separate payouts note only)
 *   detailsSubmitted ← nothing the SELLER must do now: no requirement entry
 *                      awaiting the user whose minimum_deadline is
 *                      currently_due or past_due. eventually_due items are
 *                      ignored so they can't hold an account on "Finish setup".
 */
export function statusFromV2Account(account: V2Account): ConnectStatus {
  const caps = capabilityStatuses(account);
  const entries = account.requirements?.entries ?? [];
  const dueFromUser = entries.some(
    (e) =>
      e.awaiting_action_from === 'user' &&
      (e.minimum_deadline?.status === 'currently_due' || e.minimum_deadline?.status === 'past_due')
  );
  return {
    accountId: account.id,
    chargesEnabled: caps.cardPayments === 'active',
    detailsSubmitted: !dueFromUser,
    payoutsEnabled: caps.payouts === 'active',
  };
}

/**
 * Mirror Stripe's view of the account onto the profile. Scoped by BOTH the
 * user id and the account id, so a stale or mismatched account can never
 * overwrite another profile's (or a replaced account's) status. Throws on
 * DB failure.
 */
export async function writeConnectStatus(userId: string, status: ConnectStatus): Promise<void> {
  const { error } = await adminClient()
    .from('profiles')
    .update({
      stripe_charges_enabled: status.chargesEnabled,
      stripe_details_submitted: status.detailsSubmitted,
      stripe_payouts_enabled: status.payoutsEnabled,
    })
    .eq('id', userId)
    .eq('stripe_account_id', status.accountId);
  if (error) throw error;
}

/** Error fields worth logging from a Stripe SDK error (no request payloads). */
export function stripeErrorLog(e: unknown) {
  const err = e as { type?: string; code?: string; message?: string; detail?: { message?: string } };
  // detail: the SDK attaches the underlying Node error on connection failures
  // (e.g. an invalid header), which type/message alone don't reveal.
  return JSON.stringify({ type: err?.type, code: err?.code, message: err?.message, detail: err?.detail?.message });
}
