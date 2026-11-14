import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureDb } from '../fixture-db';
import { booksTotals } from '@/lib/books-totals';
import { moneyText } from '../read';
import { listPaymentsTool, paymentFixture } from './list_payments';

const OWNER = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';

const fixture = (): Record<string, Record<string, unknown>[]> => ({
  profiles: [{ id: OWNER, timezone: 'America/Chicago' }],
  invoices: paymentFixture.invoices.map((row) => ({ ...row, user_id: OWNER })),
  invoice_payments: paymentFixture.payments.map((row) => ({ ...row, user_id: OWNER })),
  other_income: paymentFixture.otherIncome.map((row) => ({ ...row, user_id: OWNER })),
});

const run = (rows: ReturnType<typeof fixture>, args: unknown = {}) =>
  listPaymentsTool.handler(
    { db: fixtureDb(rows as never), userId: OWNER },
    listPaymentsTool.input.parse(args),
  ) as Promise<{
    match: string;
    count: number;
    rows: Array<{ name: string; secondary: string; amount: string; tone?: string }>;
    total: { amount: string };
    payments: Array<{ kind: string; amount: string }>;
  }>;

test('the list carries invoice payments, a signed refund and other income', async () => {
  const out = await run(fixture());
  assert.equal(out.match, 'many');
  assert.equal(out.count, 3);
  assert.equal(out.rows[0].amount, '+$120.00');
  assert.equal(out.rows[1].secondary, 'Not tied to an invoice · Other income · 2026-11-04');
  assert.equal(out.rows[2].amount, '\u2212$20.00');
  assert.equal(out.rows[2].tone, 'out');
});

test('the list total is the Books Collected figure for the same rows', async () => {
  const rows = fixture();
  const out = await run(rows);
  const books = booksTotals({
    payments: rows.invoice_payments as never,
    otherIncome: rows.other_income as never,
    expenses: [],
    invoices: [],
  });
  assert.equal(out.total.amount, moneyText(books.collected));
  assert.equal(out.total.amount, '$400.00');
});

test('another owner, a deleted invoice and a deleted other-income row never count', async () => {
  const rows = fixture();
  rows.invoice_payments.push({
    ...paymentFixture.payments[0],
    id: 'p3',
    user_id: OWNER,
    invoice_id: 'inv-deleted',
  });
  rows.invoices.push({
    id: 'inv-deleted', kind: 'invoice', invoice_number: 9, client_name: 'Gone', deleted_at: '2026-11-01', user_id: OWNER,
  });
  rows.invoice_payments.push({
    ...paymentFixture.payments[0],
    id: 'p4',
    user_id: OTHER,
  });
  rows.other_income.push({
    ...paymentFixture.otherIncome[0],
    id: 'o2',
    user_id: OWNER,
    deleted_at: '2026-11-05',
  });
  const out = await run(rows);
  assert.equal(out.count, 3);
});

test('a period, client and method filter narrow the list and its total', async () => {
  const out = await run(fixture(), { from: '2026-11-05', to: '2026-11-30', client: 'maria', method: 'zelle' });
  assert.equal(out.count, 1);
  assert.equal(out.total.amount, '$120.00');
  assert.equal(out.payments[0].kind, 'invoice_payment');
});

test('a from that does not parse returns no rows instead of widening to all time', async () => {
  const out = await run(fixture(), { from: '10/01/2026' });
  assert.equal(out.count, 0);
  assert.deepEqual(out.payments, []);
  assert.deepEqual((out as unknown as { ignored: string[] }).ignored, ['10/01/2026']);
  assert.equal((out as unknown as { dateProblem?: string }).dateProblem, '10/01/2026');
  assert.match(listPaymentsTool.fallback(out as never), /10\/01\/2026/);
});

test('an unknown method is reported in ignored, not fatal', async () => {
  const out = await run(fixture(), { method: 'carrier pigeon' });
  assert.equal(out.count, 3);
  assert.deepEqual((out as unknown as { ignored: string[] }).ignored, ['carrier pigeon']);
});
