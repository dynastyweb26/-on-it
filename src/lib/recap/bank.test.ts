import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  bankActivity, bankFieldsFromJson, countAndTotal, recapBankFields, waitingFor,
  type RecapBankTxnRow,
} from './bank';
import { isOpenBankRow } from '@/lib/plaid/transactions-view';

const WEEK = { start: '2026-09-21', end: '2026-09-27' };

const txn = (over: Partial<RecapBankTxnRow> = {}): RecapBankTxnRow => ({
  amount: 10,
  occurred_on: WEEK.start,
  bank_state: 'posted',
  review_state: 'new',
  removed_at: null,
  ...over,
});

test('counts and totals are cents-exact', () => {
  assert.deepEqual(countAndTotal([]), { count: 0, total: 0 });
  assert.deepEqual(countAndTotal([{ amount: '0.10' }, { amount: 0.2 }, { amount: 1 }]),
    { count: 3, total: 1.3 });
});

test('bank activity: each direction counted and totalled inside the period only', () => {
  const bank = bankActivity({
    period: WEEK,
    deposits: [
      { amount: '400.00', occurred_on: '2026-09-22' },
      { amount: 85.05, occurred_on: '2026-09-23' },
      { amount: '0.10', occurred_on: '2026-09-27' },
      { amount: 100, occurred_on: '2026-09-28' },                     // the next week
      { amount: 50, occurred_on: '2026-09-24', removed_at: '2026-09-25T15:00:00Z' }, // pulled by the bank
    ],
    transactions: [
      txn({ amount: 30.38, occurred_on: '2026-09-21', review_state: 'added' }),
      txn({ amount: '12.34', occurred_on: '2026-09-27', bank_state: 'pending' }),
      txn({ amount: 99, occurred_on: '2026-09-20' }),                  // the week before
      txn({ amount: 61.2, occurred_on: '2026-09-22', bank_state: 'removed', removed_at: '2026-09-23T15:00:00Z' }),
    ],
  });
  assert.deepEqual(bank.in, { count: 3, total: 485.15 });
  assert.deepEqual(bank.out, { count: 2, total: 42.72 });
});

test('waiting is the pinned "Unaccounted for" set: open only, any date, removed excluded', () => {
  const rows: RecapBankTxnRow[] = [
    txn({ amount: 30.38 }),
    txn({ amount: 432.98, review_state: 'needs_review', occurred_on: '2026-08-01' }),
    txn({ amount: 12, review_state: 'added' }),
    txn({ amount: 55, review_state: 'already' }),
    txn({ amount: 7, review_state: 'ignored' }),
    txn({ amount: 88, bank_state: 'removed', removed_at: '2026-09-22T15:00:00Z' }),
  ];
  assert.deepEqual(waitingFor(rows), { count: 2, total: 463.36 });
  // The bar's own rule, on the same rows: the same two, in the same order.
  assert.deepEqual(rows.filter(isOpenBankRow).map((r) => r.amount), [30.38, 432.98]);
});

test('fields are absent for a plan without bank activity, or with no connected bank', () => {
  const input = {
    canBank: true,
    connected: true,
    period: WEEK,
    deposits: [{ amount: 100, occurred_on: WEEK.start }],
    transactions: [txn()],
    open: [txn()],
  };
  assert.deepEqual(recapBankFields({ ...input, canBank: false }), {});
  assert.deepEqual(recapBankFields({ ...input, connected: false }), {});
});

test('eligible with a connected bank: both fields, zeros included', () => {
  assert.deepEqual(
    recapBankFields({ canBank: true, connected: true, period: WEEK, deposits: [], transactions: [], open: [] }),
    {
      bank: { in: { count: 0, total: 0 }, out: { count: 0, total: 0 } },
      waiting: { count: 0, total: 0 },
    },
  );
});

test('a route response is validated before it joins the payload', () => {
  assert.deepEqual(bankFieldsFromJson({
    bank: { in: { count: 3, total: 485.15 }, out: { count: 2, total: 42.725 } },
    waiting: { count: 2, total: 463.36 },
    extra: 'ignored',
  }), {
    bank: { in: { count: 3, total: 485.15 }, out: { count: 2, total: 42.73 } },
    waiting: { count: 2, total: 463.36 },
  });

  for (const bad of [null, undefined, 'x', 42, []]) assert.deepEqual(bankFieldsFromJson(bad), {});
  // A count that is not a count, a total that is not money: dropped, not printed.
  assert.deepEqual(bankFieldsFromJson({ bank: { in: { count: -1, total: 10 }, out: { count: 0, total: 0 } } }), {});
  assert.deepEqual(bankFieldsFromJson({ bank: { in: { count: 1, total: '10' }, out: { count: 0, total: 0 } } }), {});
  assert.deepEqual(bankFieldsFromJson({ bank: { in: { count: 1.5, total: 10 }, out: { count: 0, total: 0 } } }), {});
  assert.deepEqual(bankFieldsFromJson({ waiting: { count: 2, total: Number.NaN } }), {});
  // One valid half still lands: the waiting slide never needs the activity pair.
  assert.deepEqual(bankFieldsFromJson({ waiting: { count: 2, total: 10 } }),
    { waiting: { count: 2, total: 10 } });
});

test('the bank fields are composed through RLS only — no service role anywhere', () => {
  const loader = readFileSync('src/lib/recap/bank-server.ts', 'utf8');
  const route = readFileSync('src/app/api/recaps/bank/route.ts', 'utf8');
  assert.doesNotMatch(loader + route, /adminClient|service_role|SERVICE_ROLE|supabase\/admin/);
  // The one client is the viewer's own session client (cookie auth → RLS).
  assert.match(route, /from '@\/lib\/supabase\/server'/);
});
