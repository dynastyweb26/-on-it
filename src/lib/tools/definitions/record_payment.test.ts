// A payment is money, so every refusal and every write is proved here: which
// invoice is asked about, what the balance is, what the ledger row holds, and
// that one confirm writes exactly one row even when execute is called twice.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureDb } from '../fixture-db';
import { fixtureWriteDb } from '../write-fixture';
import { invoiceBalance, recordPaymentTool, RecordPaymentInput } from './record_payment';

const OWNER = '11111111-1111-1111-1111-111111111111';

const invoice = (over: Record<string, unknown> = {}) => ({
  id: 'inv-12',
  user_id: OWNER,
  kind: 'invoice',
  invoice_number: 12,
  client_name: 'Maria Santos',
  status: 'sent',
  total: 200,
  amount_paid: 0,
  due_date: '2026-10-08',
  created_at: '2026-09-02T12:00:00Z',
  deleted_at: null,
  ...over,
});

/** One owner, one timezone, and the documents a case needs. */
const account = (invoices: Record<string, unknown>[]) => ({
  profiles: [{ id: OWNER, timezone: 'America/Chicago' }],
  clients: [],
  invoices,
  invoice_payments: [],
  other_income: [],
});

const prepare = (rows: Record<string, unknown>, args: unknown) =>
  recordPaymentTool.prepare!(
    { db: fixtureDb(rows as never), userId: OWNER },
    RecordPaymentInput.parse(args),
  );

test('two open invoices for one client is a question, never a pick', async () => {
  const prepared = await prepare(account([
    invoice(),
    invoice({ id: 'inv-13', invoice_number: 13, total: 80 }),
  ]), { client: 'Maria Santos', amount: 200 });

  assert.equal(prepared.ok, false);
  if (prepared.ok) return;
  assert.match(prepared.problem, /I found 2 open invoices for Maria Santos/);
  assert.ok(prepared.problem.includes('INV-0012'));
  assert.ok(prepared.problem.includes('INV-0013'));
  // The founder's decision: never picked by a matching balance, so no figure.
  assert.equal(prepared.problem.includes('$'), false);
});

test('more than the balance is refused, never clamped', async () => {
  const prepared = await prepare(account([invoice()]), { invoice_number: 12, amount: 250 });

  assert.equal(prepared.ok, false);
  if (prepared.ok) return;
  assert.match(prepared.problem, /more than INV-0012 still owes/);
});

test('an estimate number is refused', async () => {
  const prepared = await prepare(account([
    invoice({ id: 'est-40', kind: 'quote', invoice_number: 40 }),
  ]), { invoice_number: 40, amount: 50 });

  assert.equal(prepared.ok, false);
  if (prepared.ok) return;
  assert.match(prepared.problem, /is an estimate/);
});

test('paid in full is the whole balance, and the day is the owner local midnight', async () => {
  const prepared = await prepare(account([
    invoice({ id: 'inv-74', invoice_number: 74, client_name: 'Ruth Lawrence', total: 120 }),
  ]), { client: 'Ruth', full: true, paid_on: '2026-11-15' });

  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  const resolved = prepared.resolved as { amount: number; paidAt: string; method: string };
  assert.equal(resolved.amount, 120);
  // America/Chicago on that day is UTC-6: never the UTC midnight the sheet avoids.
  assert.equal(resolved.paidAt, '2026-11-15T06:00:00.000Z');
  // A day nobody named is not a method either.
  assert.equal(resolved.method, 'other');
});

test('a future day is refused', async () => {
  const prepared = await prepare(account([invoice()]), { invoice_number: 12, full: true, paid_on: '2999-01-01' });

  assert.equal(prepared.ok, false);
  if (prepared.ok) return;
  assert.match(prepared.problem, /has not happened yet/);
});

test('the balance is total minus the ledger, floored at zero', () => {
  assert.equal(invoiceBalance({ total: 200, amount_paid: 0 }), 200);
  assert.equal(invoiceBalance({ total: '200.00', amount_paid: '50.50' }), 149.5);
  assert.equal(invoiceBalance({ total: 200, amount_paid: 260 }), 0);
});

test('the same action id confirms once: one ledger row, one write', async () => {
  const wdb = fixtureWriteDb(account([invoice()]) as never, OWNER);
  const prepared = await recordPaymentTool.prepare!(
    { db: wdb, userId: OWNER },
    RecordPaymentInput.parse({ invoice_number: 12, amount: 60, method: 'zelle' }),
  );
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;

  const ctx = { db: wdb, userId: OWNER };
  const first = await recordPaymentTool.execute!(ctx, prepared.resolved, 'act-1');
  assert.equal(first.ok, true);
  assert.equal(wdb.rows.invoice_payments?.length, 1);

  const second = await recordPaymentTool.execute!(ctx, prepared.resolved, 'act-1');
  assert.equal(second.ok, false);
  assert.equal(wdb.rows.invoice_payments?.length, 1, 'a replay wrote a second row');

  const row = wdb.rows.invoice_payments![0] as Record<string, unknown>;
  assert.equal(row.invoice_id, 'inv-12');
  assert.equal(row.user_id, OWNER);
  assert.equal(row.method, 'zelle');
  assert.equal(row.idempotency_key, 'ai-act-1');
  // amount_paid belongs to the database trigger, never to this tool.
  assert.equal(row.amount_paid, undefined);
});

test('execute re-validates the balance and refuses when it moved', async () => {
  const wdb = fixtureWriteDb(account([invoice()]) as never, OWNER);
  const prepared = await recordPaymentTool.prepare!(
    { db: wdb, userId: OWNER },
    RecordPaymentInput.parse({ invoice_number: 12, amount: 200 }),
  );
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;

  // The invoice was paid in another tab after the card was drawn.
  (wdb.rows.invoices[0] as Record<string, unknown>).amount_paid = 200;

  const outcome = await recordPaymentTool.execute!({ db: wdb, userId: OWNER }, prepared.resolved, 'act-2');
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.match(outcome.problem, /changed since I looked/);
  assert.equal(wdb.rows.invoice_payments?.length, 0, 'a refused execute wrote a row');
});
