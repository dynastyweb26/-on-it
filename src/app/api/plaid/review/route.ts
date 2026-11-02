// POST /api/plaid/review — the owner's decision on one bank row.
//
//   { transaction_id, action: 'add' | 'already' | 'ignore' | 'restore',
//     amount_cents?, category? }
//
//   add      insert the expense (plaid_transaction_id set, so the bank-verified
//            tag stays server-written) and point the row at it. Idempotent: a
//            second add answers the same expense and writes nothing.
//   already  link the row to the expense the matcher suggests. The expense must
//            be the caller's and must not stand behind another row.
//   ignore   review_state 'ignored' (restorable).
//   restore  back to 'new'.
//
// Ownership is always user.id; an id that is not the caller's answers 404. Every
// non-2xx goes through fail(), which logs exactly one line. Preview only.
//
// The writes use the service role: the migration grants the client no UPDATE on
// bank_transactions, and its trigger refuses a client-written
// expenses.plaid_transaction_id. The insert and the review_state update are two
// statements (PostgREST has no cross-table transaction), so the order is chosen
// so a retry is safe: the unique (user_id, plaid_transaction_id) makes a replayed
// add adopt the expense it already created, and a failed update deletes the
// expense it just inserted instead of leaving an orphan.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { adminClient } from '@/lib/supabase/admin';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';
import { plaidRouteEnabled } from '@/lib/plaid/config';
import { fail } from '@/lib/plaid/respond';
import { isExpenseCategory } from '@/lib/expenses';
import {
  MAX_EXPENSE_CENTS, centsToAmount, expenseCategoryFromPlaid, parseCents, shiftIsoDay, suggestMatch,
  type MatchExpense,
} from '@/lib/plaid/match';

export const runtime = 'nodejs';

const Body = z.object({
  transaction_id: z.string().uuid(),
  action: z.enum(['add', 'already', 'ignore', 'restore']),
  // Sent only when the owner edited the card's amount (integer cents).
  amount_cents: z.number().int().positive().max(MAX_EXPENSE_CENTS).optional(),
  // Sent only when the owner changed the category chip.
  category: z.string().refine(isExpenseCategory, 'unknown category').optional(),
});

const DECIDED = new Set(['added', 'already']);

type Row = {
  id: string;
  plaid_transaction_id: string;
  merchant: string | null;
  description: string;
  amount: string | number;
  occurred_on: string;
  category: string | null;
  review_state: string;
  expense_id: string | null;
};

const ROW_SELECT = 'id, plaid_transaction_id, merchant, description, amount, occurred_on, category, review_state, expense_id';

const REVIEW_STATE_FOR = { add: 'added', already: 'already', ignore: 'ignored', restore: 'new' } as const;

export async function POST(req: NextRequest) {
  if (!plaidRouteEnabled(process.env.VERCEL_ENV)) return fail('review', 'route_disabled');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('review', 'unauthorized');

  if (!(await rateLimit('plaid_review', rateIdentifier(req, user.id)))) {
    return fail('review', 'rate_limited');
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail('review', 'invalid_request');
  const { transaction_id: transactionId, action } = parsed.data;

  const admin = adminClient();

  const { data: rowData, error: readError } = await admin
    .from('bank_transactions')
    .select(ROW_SELECT)
    .eq('id', transactionId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (readError) return fail('review', 'db_read_failed', readError.code);
  const row = rowData as unknown as Row | null;
  // Another user's row and a missing row are the same answer.
  if (!row) return fail('review', 'not_found');

  // Idempotent: the row already counts through an expense, so a repeated submit
  // (double tap, retried request) answers that expense and writes nothing.
  if (DECIDED.has(row.review_state) && row.expense_id && action === 'add') {
    return NextResponse.json({
      ok: true,
      transaction_id: row.id,
      review_state: row.review_state,
      expense_id: row.expense_id,
    });
  }

  const now = new Date().toISOString();

  if (action === 'add') {
    const bankCents = parseCents(row.amount);
    if (bankCents === null || bankCents <= 0) return fail('review', 'invalid_request');
    const cents = parsed.data.amount_cents ?? bankCents;
    if (!Number.isSafeInteger(cents) || cents <= 0 || cents > MAX_EXPENSE_CENTS) {
      return fail('review', 'invalid_request');
    }
    const category = parsed.data.category ?? expenseCategoryFromPlaid(row.category, row.description);
    if (!isExpenseCategory(category)) return fail('review', 'invalid_request');

    const { data: inserted, error: insertError } = await admin
      .from('expenses')
      .insert({
        user_id: user.id,
        vendor: ((row.merchant ?? '').trim() || row.description.trim()).slice(0, 120) || null,
        description: row.description.slice(0, 300),
        amount: centsToAmount(cents),
        category,
        spent_on: row.occurred_on,
        plaid_transaction_id: row.plaid_transaction_id,
      })
      .select('id')
      .maybeSingle();

    let expenseId: string | null = (inserted as { id?: string } | null)?.id ?? null;

    // 23505 on (user_id, plaid_transaction_id): an earlier attempt already
    // created the expense. Adopt it instead of failing the tap.
    if (insertError?.code === '23505') {
      const { data: existing, error: existingError } = await admin
        .from('expenses')
        .select('id')
        .eq('user_id', user.id)
        .eq('plaid_transaction_id', row.plaid_transaction_id)
        .maybeSingle();
      if (existingError) return fail('review', 'db_read_failed', existingError.code);
      expenseId = (existing as { id?: string } | null)?.id ?? null;
      if (!expenseId) return fail('review', 'db_insert_failed', insertError.code);
    } else if (insertError || !expenseId) {
      // The free-plan cap and every other refusal land here: one line, no body.
      return fail('review', 'db_insert_failed', insertError?.code);
    }

    const { error: updateError } = await admin
      .from('bank_transactions')
      .update({ review_state: 'added', expense_id: expenseId, updated_at: now })
      .eq('id', row.id)
      .eq('user_id', user.id);

    if (updateError) {
      // Compensate: a failed link never leaves an expense the owner cannot see.
      await admin.from('expenses').delete().eq('id', expenseId).eq('user_id', user.id);
      return fail('review', 'db_update_failed', updateError.code);
    }

    return NextResponse.json({
      ok: true,
      transaction_id: row.id,
      review_state: 'added',
      expense_id: expenseId,
    });
  }

  if (action === 'already') {
    const bankCents = parseCents(row.amount);
    if (bankCents === null) return fail('review', 'invalid_request');

    const from = shiftIsoDay(row.occurred_on, -3);
    const to = shiftIsoDay(row.occurred_on, 3);
    if (!from || !to) return fail('review', 'invalid_request');

    const [{ data: expenseRows, error: expenseError }, { data: links, error: linkError }] = await Promise.all([
      admin
        .from('expenses')
        .select('id, vendor, description, amount, spent_on, category')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .gte('spent_on', from)
        .lte('spent_on', to),
      admin
        .from('bank_transactions')
        .select('expense_id')
        .eq('user_id', user.id)
        .not('expense_id', 'is', null),
    ]);
    if (expenseError) return fail('review', 'db_read_failed', expenseError.code);
    if (linkError) return fail('review', 'db_read_failed', linkError.code);

    const linked = new Set(
      ((links ?? []) as unknown as { expense_id: string | null }[])
        .map((link) => link.expense_id)
        .filter((id): id is string => typeof id === 'string'),
    );
    const match = suggestMatch(
      {
        amount_cents: bankCents,
        occurred_on: row.occurred_on,
        merchant: row.merchant,
        description: row.description,
      },
      (expenseRows ?? []) as unknown as MatchExpense[],
      linked,
    );
    // Nothing to link to is a 404, never an invented expense.
    if (!match) return fail('review', 'not_found');

    const { error: updateError } = await admin
      .from('bank_transactions')
      .update({ review_state: 'already', expense_id: match.expense_id, updated_at: now })
      .eq('id', row.id)
      .eq('user_id', user.id);
    if (updateError) return fail('review', 'db_update_failed', updateError.code);

    return NextResponse.json({
      ok: true,
      transaction_id: row.id,
      review_state: 'already',
      expense_id: match.expense_id,
    });
  }

  // ignore / restore: the review state moves, nothing else does.
  const { error: stateError } = await admin
    .from('bank_transactions')
    .update({ review_state: REVIEW_STATE_FOR[action], updated_at: now })
    .eq('id', row.id)
    .eq('user_id', user.id);
  if (stateError) return fail('review', 'db_update_failed', stateError.code);

  return NextResponse.json({
    ok: true,
    transaction_id: row.id,
    review_state: REVIEW_STATE_FOR[action],
    expense_id: row.expense_id,
  });
}
