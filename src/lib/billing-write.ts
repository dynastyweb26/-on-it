// The only way a server path writes a profile's billing state.
//
// Two guards ride inside the UPDATE itself, so nothing can slip between a check
// and a write:
//   • the founder guard (optional): access_tier is null or not 'founder';
//   • the source rule (always): billing_source is null, is this writer, or the
//     profile is not on a live tier (plus the store-wins-over-Stripe
//     exception, which exists only for a write that is itself live). The same
//     UPDATE sets billing_source to this writer.
//
// A zero-row result is not an error: it means someone else owns the profile.
// It is explained in one log line, and the caller carries on — a webhook must
// still answer 2xx or the provider retries forever.
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  billingSourceOr,
  isDoubleBilling,
  isLiveTier,
  isStoreSource,
  type BillingSource,
} from './billing-source';

export type ProfileMatch = { id: string } | { stripe_customer_id: string };

type Owner = { id: string; access_tier: string | null; billing_source: string | null };

/** Read who owns the profile right now — for logging and the double-billing
 *  line only. The write never depends on it. */
export async function currentBillingOwner(
  supabase: SupabaseClient,
  match: ProfileMatch,
): Promise<Owner | null> {
  let q = supabase.from('profiles').select('id, access_tier, billing_source');
  q = 'id' in match ? q.eq('id', match.id) : q.eq('stripe_customer_id', match.stripe_customer_id);
  const { data, error } = await q.maybeSingle();
  if (error) {
    console.warn('[billing] owner read failed', error.code ?? error.message);
    return null;
  }
  return (data as Owner | null) ?? null;
}

function where(match: ProfileMatch, q: any) {
  return 'id' in match ? q.eq('id', match.id) : q.eq('stripe_customer_id', match.stripe_customer_id);
}

export interface BillingWrite {
  writer: BillingSource;
  match: ProfileMatch;
  /** The billing fields to write; billing_source is added. */
  fields: Record<string, unknown>;
  /** Tier and plan writes set this; billing-fact writes pass false so a founder
   *  keeps today's billing facts (only their tier and plan are frozen). */
  guardFounder: boolean;
}

/** True when a row was written. Never throws on "somebody else owns it". */
export async function writeBillingFields(
  supabase: SupabaseClient,
  write: BillingWrite,
): Promise<boolean> {
  // The tier this UPDATE is writing. It gates the store-over-Stripe exception:
  // a store may take a live Stripe subscriber over by granting access, never by
  // cancelling it.
  const writtenTier = typeof write.fields.access_tier === 'string' ? write.fields.access_tier : null;

  // A store write over a live Stripe subscription is the one deliberate
  // override. Log it, then write (the WHERE already allows it).
  if (isStoreSource(write.writer) && isLiveTier(writtenTier)) {
    const owner = await currentBillingOwner(supabase, write.match);
    if (owner && isDoubleBilling(write.writer, owner.billing_source, owner.access_tier, writtenTier)) {
      console.warn('double_billing', JSON.stringify({
        userId: owner.id,
        store: write.writer,
        previousSource: owner.billing_source,
      }));
    }
  }

  // The two .or() calls (founder, source) are ANDed by PostgREST, so both apply
  // inside this one UPDATE.
  let q: any = supabase
    .from('profiles')
    .update({ ...write.fields, billing_source: write.writer });
  q = where(write.match, q);
  if (write.guardFounder) q = q.or('access_tier.is.null,access_tier.neq.founder');
  q = q.or(billingSourceOr(write.writer, writtenTier)).select('id');

  const { data, error } = await q;
  if (error) throw error;
  if (Array.isArray(data) && data.length > 0) return true;

  // Nothing was written: say why, once.
  const owner = await currentBillingOwner(supabase, write.match);
  if (owner?.access_tier === 'founder') {
    console.warn('[billing] write skipped: founder', JSON.stringify({ userId: owner.id, writer: write.writer }));
  } else if (owner && isLiveTier(owner.access_tier) && owner.billing_source && owner.billing_source !== write.writer) {
    // Includes the store vs live-Stripe case when the store write is NOT live:
    // a lapsed store subscription cannot cancel a Stripe subscriber.
    console.warn('[billing] write skipped: another source owns a live subscription', JSON.stringify({
      userId: owner.id,
      writer: write.writer,
      owner: owner.billing_source,
      writtenTier,
    }));
  } else {
    console.warn('[billing] write matched no row', JSON.stringify({ writer: write.writer }));
  }
  return false;
}
