// ═══ The recap's bank fields, composed on the server for ONE viewer ═══
// The reader is the viewer's own session client (cookie auth), so RLS is the
// boundary: no admin key, no service role, no cross-owner read. The plan and
// connection gates run first, so a viewer without bank activity reads no bank
// rows at all. A failed read answers {} — the fields are absent, never a guess.
// Imported by route handlers only (never a client module).
import type { SupabaseClient } from '@supabase/supabase-js';
import { entitlementsFor } from '@/lib/entitlements';
import { recapBankFields, type RecapBankDepositRow, type RecapBankFields, type RecapBankTxnRow } from './bank';
import type { RecapPeriod } from './dates';

/** The only columns either bank table gives this composer. No Plaid id, no
 *  token, no cursor: none of them is needed to count rows or add money up. */
export const RECAP_DEPOSIT_COLS = 'amount, occurred_on, removed_at';
export const RECAP_TXN_COLS = 'amount, occurred_on, bank_state, review_state, removed_at';

export async function loadRecapBank(
  supabase: SupabaseClient,
  userId: string,
  period: Pick<RecapPeriod, 'start' | 'end'>,
): Promise<RecapBankFields> {
  // RLS: the caller reads only their own profile row.
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('access_tier, plan')
    .eq('id', userId)
    .maybeSingle();
  if (profileError) {
    console.error('[recap] bank plan read failed', profileError.code ?? profileError.message);
    return {};
  }
  // canBank, not a plan name: entitlementsFor is the ONE place a plan is read,
  // and a founder resolves to Plus there.
  if (!entitlementsFor(profile?.access_tier, profile?.plan).canBank) return {};

  // A connected bank = at least one linked login the bank has not removed.
  const { data: item, error: itemError } = await supabase
    .from('plaid_items')
    .select('id')
    .eq('user_id', userId)
    .neq('status', 'removed')
    .limit(1)
    .maybeSingle();
  if (itemError) {
    console.error('[recap] bank connection read failed', itemError.code ?? itemError.message);
    return {};
  }
  if (!item) return {};

  const [deposits, periodTxns, openTxns] = await Promise.all([
    // Money in the bank picked up in the period.
    supabase
      .from('bank_deposits')
      .select(RECAP_DEPOSIT_COLS)
      .eq('user_id', userId)
      .is('removed_at', null)
      .gte('occurred_on', period.start)
      .lte('occurred_on', period.end),
    // Money out in the period.
    supabase
      .from('bank_transactions')
      .select(RECAP_TXN_COLS)
      .eq('user_id', userId)
      .is('removed_at', null)
      .neq('bank_state', 'removed')
      .gte('occurred_on', period.start)
      .lte('occurred_on', period.end),
    // Still unaccounted for: the pinned row's query, in any period.
    supabase
      .from('bank_transactions')
      .select(RECAP_TXN_COLS)
      .eq('user_id', userId)
      .is('removed_at', null)
      .neq('bank_state', 'removed')
      .in('review_state', ['new', 'needs_review']),
  ]);
  if (deposits.error || periodTxns.error || openTxns.error) {
    const error = deposits.error ?? periodTxns.error ?? openTxns.error;
    console.error('[recap] bank rows read failed', error?.code ?? error?.message);
    return {};
  }

  return recapBankFields({
    canBank: true,
    connected: true,
    period,
    deposits: (deposits.data ?? []) as unknown as RecapBankDepositRow[],
    transactions: (periodTxns.data ?? []) as unknown as RecapBankTxnRow[],
    open: (openTxns.data ?? []) as unknown as RecapBankTxnRow[],
  });
}
