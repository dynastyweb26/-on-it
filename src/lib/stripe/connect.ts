// ═══ Stripe Connect (Standard accounts, direct charges) ═══
// Sellers connect their OWN Stripe Standard account; their clients pay them
// directly. We never take an application fee. This module holds the shared
// server-side pieces the /api/connect/* routes (and, later, the Connect
// webhook) use.
//
// The stripe_* profile columns are NOT granted to authenticated (migration
// 20260925000000), so every write here goes through the service-role admin
// client. Callers are responsible for authenticating the user first.
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
  return process.env.STRIPE_CONNECT_ENABLED === 'true';
}

export interface ConnectStatus {
  accountId: string;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
  payoutsEnabled: boolean;
}

export function statusFromAccount(account: Stripe.Account): ConnectStatus {
  return {
    accountId: account.id,
    chargesEnabled: Boolean(account.charges_enabled),
    detailsSubmitted: Boolean(account.details_submitted),
    payoutsEnabled: Boolean(account.payouts_enabled),
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
