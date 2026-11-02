// POST /api/plaid/review — the owner's decision on one bank row.
//
//   { transaction_id, action: 'add' | 'already' | 'ignore' | 'restore',
//     amount_cents?, category?, receipt_hash? }
//
//   add      insert the expense (plaid_transaction_id set, so the bank-verified
//            tag stays server-written) and point the row at it. Idempotent: a
//            second add answers the same expense and writes nothing.
//   already  link the row to the expense the matcher suggests. The expense must
//            be the caller's and must not stand behind another row.
//   ignore   review_state 'ignored' (restorable).
//   restore  back to 'new'.
//
// Which of those a row may take is decided by ./review-transitions (pure and
// exhaustively tested), never by the caller: a decided row, a restore from the
// wrong tab and a charge the bank removed all answer 409 bad_state.
//
// Ownership is always user.id; an id that is not the caller's answers 404. Every
// non-2xx goes through fail(), which logs exactly one line. Preview only.
//
// add also accepts an optional receipt_hash — the content hash the client already
// computed for a receipt photo, and NOTHING else. The storage path is rebuilt
// here from user.id (./receipt-verify.ts), so a foreign object and a client-sent
// path are both unexpressible; the stored bytes are downloaded with the service
// role and must measure, sniff as JPEG and hash to the named value before any
// expense exists. A refused receipt writes nothing at all, and this route never
// deletes a storage object: content-hash keys can be shared.
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
import { transition } from '@/lib/plaid/review-transitions';
import {
  RECEIPT_BUCKET, receiptObjectPath, uniqueViolation, verifyReceipt,
} from '@/lib/plaid/receipt-verify';

export const runtime = 'nodejs';

const Body = z.object({
  transaction_id: z.string().uuid(),
  action: z.enum(['add', 'already', 'ignore', 'restore']),
  // Sent only when the owner edited the card's amount (integer cents).
  amount_cents: z.number().int().positive().max(MAX_EXPENSE_CENTS).optional(),
  // Sent only when the owner changed the category chip.
  category: z.string().refine(isExpenseCategory, 'unknown category').optional(),
  // Sent only when the card had a receipt photo picked. The format is checked
  // below so a malformed value answers 422 receipt_invalid, not a generic 400.
  receipt_hash: z.string().optional(),
});

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
  bank_state: string;
  removed_at: string | null;
};

const ROW_SELECT = 'id, plaid_transaction_id, merchant, description, amount, occurred_on, category, '
  + 'review_state, expense_id, bank_state, removed_at';

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

  // The state machine lives in ./review-transitions (pure, exhaustively tested):
  // only an open row is ignored or linked, only an ignored row is restored, a
  // decided row replays its own add, and a removed charge is never added.
  const decision = transition({
    action,
    reviewState: row.review_state,
    bankState: row.bank_state,
    removedAt: row.removed_at,
    expenseId: row.expense_id,
  });

  // Idempotent: the row already counts through an expense, so a repeated submit
  // (double tap, retried request) answers that expense and writes nothing.
  if (decision.kind === 'replay') {
    return NextResponse.json({
      ok: true,
      transaction_id: row.id,
      review_state: row.review_state,
      expense_id: row.expense_id,
    });
  }
  // Decided, removed, or Restore from the wrong tab: one 409, one log line.
  if (decision.kind === 'bad_state') return fail('review', 'bad_state');

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

    // ── Optional receipt ──────────────────────────────────────
    // The client sends a content hash only. Everything below happens BEFORE the
    // insert, so a refused receipt leaves no expense behind: the path is rebuilt
    // from user.id, a receipt already on another live expense is a 409, and the
    // object must exist, fit, sniff as JPEG and hash to the claimed value.
    let receiptPath: string | null = null;
    let receiptHash: string | null = null;
    if (parsed.data.receipt_hash !== undefined) {
      const hash = parsed.data.receipt_hash;
      const path = receiptObjectPath(user.id, hash);
      if (!path) return fail('review', 'receipt_invalid');

      const { data: duplicate, error: duplicateError } = await admin
        .from('expenses')
        .select('id')
        .eq('user_id', user.id)
        .eq('receipt_hash', hash)
        .is('deleted_at', null)
        .maybeSingle();
      if (duplicateError) return fail('review', 'db_read_failed', duplicateError.code);
      if (duplicate) return fail('review', 'receipt_duplicate');

      const { data: blob, error: downloadError } = await admin
        .storage
        .from(RECEIPT_BUCKET)
        .download(path);
      const bytes = blob ? new Uint8Array(await blob.arrayBuffer()) : null;
      const refusal = downloadError ? 'receipt_missing' : verifyReceipt(bytes, hash);
      if (refusal) return fail('review', refusal);

      receiptPath = path;
      receiptHash = hash;
    }

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
        // Set together or not at all: the hash is what the dedup index reads.
        receipt_url: receiptPath,
        receipt_hash: receiptHash,
      })
      .select('id')
      .maybeSingle();

    let expenseId: string | null = (inserted as { id?: string } | null)?.id ?? null;

    // 23505 on (user_id, plaid_transaction_id): an earlier attempt already
    // created the expense. Adopt it instead of failing the tap.
    if (insertError?.code === '23505') {
      // Two indexes raise 23505 now, so the constraint NAME decides. A receipt
      // clash is never adopted — that would attach this row to an expense whose
      // photo belongs to a different charge — and a replay never re-attaches.
      if (uniqueViolation(insertError) === 'receipt_hash') {
        return fail('review', 'receipt_duplicate');
      }
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
      .update({ review_state: decision.next, expense_id: expenseId, updated_at: now })
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
      review_state: decision.next,
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
      .update({ review_state: decision.next, expense_id: match.expense_id, updated_at: now })
      .eq('id', row.id)
      .eq('user_id', user.id);
    if (updateError) return fail('review', 'db_update_failed', updateError.code);

    return NextResponse.json({
      ok: true,
      transaction_id: row.id,
      review_state: decision.next,
      expense_id: match.expense_id,
    });
  }

  // ignore / restore: the review state moves, nothing else does.
  const { error: stateError } = await admin
    .from('bank_transactions')
    .update({ review_state: decision.next, updated_at: now })
    .eq('id', row.id)
    .eq('user_id', user.id);
  if (stateError) return fail('review', 'db_update_failed', stateError.code);

  return NextResponse.json({
    ok: true,
    transaction_id: row.id,
    review_state: decision.next,
    expense_id: row.expense_id,
  });
}
