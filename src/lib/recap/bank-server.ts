// ═══ The recap's bank fields, composed on the server for ONE viewer ═══
// The reader is the viewer's own session client (cookie auth), so RLS is the
// boundary: no admin key, no service role, no cross-owner read. The plan and
// connection gates run first, so a viewer without bank activity reads no bank
// rows at all. A failed read answers {} — the fields are absent, never a guess.
// Imported by route handlers only (never a client module).
import type { SupabaseClient } from '@supabase/supabase-js';
import { entitlementsFor } from '@/lib/entitlements';
import {
  recapBankFields,
  type RecapBankDepositLinkRow,
  type RecapBankDepositRow,
  type RecapBankFields,
  type RecapBankItemRow,
  type RecapBankAccountRow,
  type RecapBankTxnRow,
} from './bank';
import type { RecapPeriod } from './dates';

/** The only columns these slides need: no Plaid id, token or cursor, and no
 *  amounts — the design prints counts, never money. */
export const RECAP_DEPOSIT_COLS = 'id, item_id, account_id, name, merchant_name, occurred_on, removed_at';
export const RECAP_TXN_COLS = 'id, item_id, account_id, merchant, description, occurred_on, bank_state, review_state, removed_at';
export const RECAP_PENDING_DEPOSIT_COLS = 'id, name, merchant_name, occurred_on, removed_at';

/** The period's own record counts, straight from the stored payload: money in
 *  (collected.payments, all sources) and money out (spend.count). */
export type RecapRecordedCounts = { in: number; out: number };

export async function loadRecapBank(
  supabase: SupabaseClient,
  userId: string,
  period: Pick<RecapPeriod, 'start' | 'end'>,
  recorded: RecapRecordedCounts,
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

  // A connected bank = at least one linked login the bank has not removed. The
  // rows also name the institution and attribute activity to it.
  const { data: itemRows, error: itemError } = await supabase
    .from('plaid_items')
    .select('id, institution_name')
    .eq('user_id', userId)
    .neq('status', 'removed');
  if (itemError) {
    console.error('[recap] bank connection read failed', itemError.code ?? itemError.message);
    return {};
  }
  const items = (itemRows ?? []) as unknown as RecapBankItemRow[];
  if (!items.length) return {};

  const [periodDeposits, openDeposits, periodTxns, openTxns, links, income, accounts] = await Promise.all([
    // Money in the bank picked up in the period.
    supabase
      .from('bank_deposits')
      .select(RECAP_DEPOSIT_COLS)
      .eq('user_id', userId)
      .is('removed_at', null)
      .gte('occurred_on', period.start)
      .lte('occurred_on', period.end),
    // Deposits still undecided, any period (slide 08).
    supabase
      .from('bank_deposits')
      .select(RECAP_PENDING_DEPOSIT_COLS)
      .eq('user_id', userId)
      .is('removed_at', null),
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
    // Every deposit decision: decides slide 08's deposits and the auto-in count.
    supabase
      .from('bank_deposit_links')
      .select('deposit_id, kind')
      .eq('user_id', userId),
    // Deposits that became other income (one per deposit) — also a decision.
    supabase
      .from('other_income')
      .select('deposit_id')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .not('deposit_id', 'is', null),
    // The accounts' last digits only (mask): the slide prints "Chase ···· 4821".
    supabase
      .from('plaid_accounts')
      .select('id, item_id, mask')
      .eq('user_id', userId),
  ]);
  const failed = periodDeposits.error ?? openDeposits.error ?? periodTxns.error
    ?? openTxns.error ?? links.error ?? income.error ?? accounts.error;
  if (failed) {
    console.error('[recap] bank rows read failed', failed.code ?? failed.message);
    return {};
  }

  return recapBankFields({
    canBank: true,
    connected: true,
    period,
    recordedIn: recorded.in,
    recordedOut: recorded.out,
    items,
    accounts: (accounts.data ?? []) as unknown as RecapBankAccountRow[],
    periodDeposits: (periodDeposits.data ?? []) as unknown as RecapBankDepositRow[],
    periodTransactions: (periodTxns.data ?? []) as unknown as RecapBankTxnRow[],
    openDeposits: (openDeposits.data ?? []) as unknown as RecapBankDepositRow[],
    openTransactions: (openTxns.data ?? []) as unknown as RecapBankTxnRow[],
    depositLinks: (links.data ?? []) as unknown as RecapBankDepositLinkRow[],
    incomeDepositIds: ((income.data ?? []) as unknown as { deposit_id: string | null }[])
      .map((row) => row.deposit_id)
      .filter((id): id is string => typeof id === 'string'),
  });
}
