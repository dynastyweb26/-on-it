// GET /api/plaid/transactions — the owner's open bank rows for the review
// stack, with a suggested expense per row and the decided counts.
//
// Reads through the SESSION client, so RLS (owner-only) is the boundary: the
// admin key is not used here at all. Only the columns in ./transactions-view
// can be selected — no encrypted token, Plaid id, cursor or error text. A charge
// the bank removed is never listed: the query excludes it and the mapper drops
// it too.
//
// Preview only: 404 unless VERCEL_ENV === 'preview'. Node runtime. Every non-2xx
// goes through fail(), which logs exactly one line.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';
import { plaidRouteEnabled } from '@/lib/plaid/config';
import { fail } from '@/lib/plaid/respond';
import { shiftIsoDay } from '@/lib/plaid/match';
import {
  EXPENSE_SELECT, ROW_SELECT, openBankRows, transactionsResponse,
  type BankRowRow,
} from '@/lib/plaid/transactions-view';
import type { MatchExpense } from '@/lib/plaid/match';

export const runtime = 'nodejs';

/** The stack is a batch, not a ledger screen: 50 rows is more than a sitting. */
const MAX_ROWS = 50;
const COUNT_STATES = ['added', 'already', 'ignored'] as const;

export async function GET(req: NextRequest) {
  if (!plaidRouteEnabled(process.env.VERCEL_ENV)) return fail('transactions', 'route_disabled');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('transactions', 'unauthorized');

  if (!(await rateLimit('plaid_transactions', rateIdentifier(req, user.id)))) {
    return fail('transactions', 'rate_limited');
  }

  const { data, error } = await supabase
    .from('bank_transactions')
    .select(ROW_SELECT)
    .eq('user_id', user.id)
    .in('review_state', ['new', 'needs_review'])
    // A charge the bank pulled is never the owner's to decide.
    .neq('bank_state', 'removed')
    .is('removed_at', null)
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(MAX_ROWS);

  if (error) return fail('transactions', 'db_read_failed', error.code);

  // One count query per decided state: the popup and the Ignored badge read
  // these without pulling the rows themselves.
  const counts: Record<string, number> = {};
  for (const state of COUNT_STATES) {
    const { count, error: countError } = await supabase
      .from('bank_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('review_state', state);
    if (countError) return fail('transactions', 'db_read_failed', countError.code);
    counts[state] = count ?? 0;
  }

  const rows = (data ?? []) as unknown as BankRowRow[];
  const open = openBankRows(rows);
  let expenses: MatchExpense[] = [];
  let linkedExpenseIds: string[] = [];

  if (open.length > 0) {
    // The date window (±3 days around the oldest and newest row) keeps this a
    // handful of expenses; the matcher then compares cents and merchants.
    const dates = open.map((row) => row.occurred_on).sort();
    const from = shiftIsoDay(dates[0], -3);
    const to = shiftIsoDay(dates[dates.length - 1], 3);
    if (!from || !to) return fail('transactions', 'db_read_failed');

    const { data: expenseRows, error: expenseError } = await supabase
      .from('expenses')
      .select(EXPENSE_SELECT)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .gte('spent_on', from)
      .lte('spent_on', to);
    if (expenseError) return fail('transactions', 'db_read_failed', expenseError.code);
    expenses = (expenseRows ?? []) as unknown as MatchExpense[];

    // An expense already standing behind another bank row is never suggested.
    const { data: links, error: linkError } = await supabase
      .from('bank_transactions')
      .select('expense_id')
      .eq('user_id', user.id)
      .not('expense_id', 'is', null);
    if (linkError) return fail('transactions', 'db_read_failed', linkError.code);
    linkedExpenseIds = ((links ?? []) as unknown as { expense_id: string | null }[])
      .map((row) => row.expense_id)
      .filter((id): id is string => typeof id === 'string');
  }

  return NextResponse.json({
    items: transactionsResponse(rows, expenses, new Set(linkedExpenseIds)).items,
    counts: {
      added: counts.added ?? 0,
      already: counts.already ?? 0,
      ignored: counts.ignored ?? 0,
    },
  });
}
