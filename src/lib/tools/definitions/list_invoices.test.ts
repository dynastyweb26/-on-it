// list_invoices: kind, filters, cap, ambiguity and money.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureDb } from '../fixture-db';
import { listInvoicesTool } from './list_invoices';

const OWNER = '11111111-1111-1111-1111-111111111111';
const inv = (n: number, over: Record<string, unknown> = {}) => ({
  id: `inv-${n}`,
  user_id: OWNER,
  kind: 'invoice',
  invoice_number: n,
  client_name: 'Maria Santos',
  status: 'sent',
  total: 100 + n,
  amount_paid: 0,
  due_date: '2026-10-01',
  created_at: `2026-10-0${n}T00:00:00Z`,
  deleted_at: null,
  ...over,
});
const run = (rows: unknown[], args: unknown = {}) =>
  listInvoicesTool.handler(
    { db: fixtureDb({ invoices: rows as never }), userId: OWNER },
    listInvoicesTool.input.parse(args),
  );

test('invoices only, newest first, with money composed by the server', async () => {
  const out = (await run([inv(1), inv(2, { kind: 'quote' }), inv(3)])) as never as {
    count: number;
    rows: { amount: string }[];
    documents: { noun: string }[];
  };
  assert.equal(out.count, 2);
  assert.equal(out.documents.every((d) => d.noun === 'invoice'), true);
  assert.equal(out.rows[0].amount, '$103.00');
});

test('forgiving filters: known status applies, unknown is reported', async () => {
  const out = (await run([inv(1), inv(2, { status: 'paid' })], { status: ['paid', 'banana'] })) as never as {
    count: number;
    ignored: string[];
  };
  assert.equal(out.count, 1);
  assert.deepEqual(out.ignored, ['banana']);
});

test('client, date and amount filters narrow the list', async () => {
  const out = (await run([inv(1, { client_name: 'Ruth Lawrence' }), inv(2)], {
    client: 'ruth',
    min_amount: 50,
    from: '2026-10-01',
    to: '2026-10-02',
  })) as never as { count: number };
  assert.equal(out.count, 1);
});

test('caps at 25 rows while the count stays the full total', async () => {
  const rows = Array.from({ length: 30 }, (_, i) => inv(i + 1));
  const out = (await run(rows)) as never as { count: number; rows: unknown[]; match: string };
  assert.equal(out.count, 30);
  assert.equal(out.rows.length, 25);
  assert.equal(out.match, 'many');
});

test('another owner’s rows never appear', async () => {
  const out = (await run([inv(1, { user_id: '22222222-2222-2222-2222-222222222222' })])) as never as {
    match: string;
  };
  assert.equal(out.match, 'none');
});
