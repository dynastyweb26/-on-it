import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteDraftTool } from './delete_draft';
import { fixtureDb } from '../fixture-db';
import { fixtureWriteDb } from '../write-fixture';

const OWNER = '11111111-1111-1111-1111-111111111111';

const doc = (over: Record<string, unknown> = {}) => ({
  id: 'inv-12',
  user_id: OWNER,
  kind: 'invoice',
  invoice_number: 12,
  client_name: 'Maria Santos',
  status: 'draft',
  due_date: '2026-12-05',
  notes: null,
  approved_at: null,
  converted_from: null,
  revoked_at: null,
  deleted_at: null,
  ...over,
});

const prepare = (args: Record<string, unknown>, rows: unknown[] = [doc()], extra: Record<string, unknown> = {}) =>
  deleteDraftTool.prepare!(
    { db: fixtureDb({ invoices: rows as never, clients: [], other_income: [], ...extra } as never), userId: OWNER },
    args as never,
  );

test('a draft is proposed with its number and client', async () => {
  const prepared = await prepare({ number: 12 });
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  assert.equal(prepared.row.summary, 'Delete draft INV-0012 for Maria Santos');
  assert.equal(prepared.row.amount, '');
});

test('a sent document is refused, and the sentence says why', async () => {
  const prepared = await prepare({ number: 12 }, [doc({ status: 'sent' })]);
  assert.equal(prepared.ok, false);
  if (prepared.ok) return;
  assert.match(prepared.problem, /INV-0012 is sent, so I cannot delete it/);
});

test('a draft with a payment on it is refused', async () => {
  const prepared = await prepare({ number: 12 }, [doc()], {
    invoice_payments: [{ id: 'pay-1', user_id: OWNER, invoice_id: 'inv-12', amount: 20 }],
  });
  assert.equal(prepared.ok, false);
  if (prepared.ok) return;
  assert.match(prepared.problem, /has a payment on it/);
});

test('a signed estimate is refused', async () => {
  const prepared = await prepare({ number: 4 }, [
    doc({ id: 'est-4', kind: 'quote', invoice_number: 4, approved_at: '2026-11-01T00:00:00Z' }),
  ]);
  assert.equal(prepared.ok, false);
  if (prepared.ok) return;
  assert.match(prepared.problem, /was signed/);
});

test('a client with two drafts is a question naming both', async () => {
  const prepared = await prepare({ client: 'Maria' }, [
    doc(),
    doc({ id: 'inv-13', invoice_number: 13 }),
  ], {
    clients: [{ id: 'cli-1', user_id: OWNER, name: 'Maria Santos', deleted_at: null }],
  });
  assert.equal(prepared.ok, false);
  if (prepared.ok) return;
  assert.match(prepared.problem, /I found 2 drafts for Maria Santos/);
  assert.match(prepared.problem, /INV-0012/);
  assert.match(prepared.problem, /INV-0013/);
});

// Invoices and estimates are numbered apart, so INV-0003 and E-0003 can both be
// live. A number alone must never pick one of them.
const sharedThree = () => [
  doc({ id: 'inv-3', invoice_number: 3 }),
  doc({ id: 'est-3', kind: 'quote', invoice_number: 3 }),
];

test('invoice 3 and estimate 3: a number alone asks which, never picks docs[0]', async () => {
  const prepared = await prepare({ number: 3 }, sharedThree());
  assert.equal(prepared.ok, false);
  if (prepared.ok) return;
  assert.equal(prepared.problem, 'There is an invoice 3 and an estimate 3. Which one?');
});

test('kind settles a shared number', async () => {
  const estimate = await prepare({ number: 3, kind: 'estimate' }, sharedThree());
  assert.equal(estimate.ok, true);
  if (!estimate.ok) return;
  assert.equal(estimate.row.summary, 'Delete draft E-0003 for Maria Santos');

  const invoice = await prepare({ number: 3, kind: 'invoice' }, sharedThree());
  assert.equal(invoice.ok, true);
  if (!invoice.ok) return;
  assert.equal(invoice.row.summary, 'Delete draft INV-0003 for Maria Santos');
});

test('kind narrows a client lookup too', async () => {
  const prepared = await prepare({ client: 'Maria', kind: 'estimate' }, sharedThree(), {
    clients: [{ id: 'cli-1', user_id: OWNER, name: 'Maria Santos', deleted_at: null }],
  });
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  assert.equal(prepared.row.summary, 'Delete draft E-0003 for Maria Santos');
});

test('execute soft deletes the draft', async () => {
  const db = fixtureWriteDb({ invoices: [doc()], invoice_payments: [] }, OWNER);
  const out = await deleteDraftTool.execute!(
    { db, userId: OWNER },
    { id: 'inv-12', label: 'INV-0012', clientName: 'Maria Santos', kind: 'invoice' },
    'action-1',
  );
  assert.equal(out.ok, true);
  assert.equal(db.updates, 1);
  assert.equal(db.rows.invoices.length, 1);
  assert.ok((db.rows.invoices[0] as Record<string, unknown>).deleted_at);
});

test('execute refuses a draft that was sent since the card', async () => {
  const db = fixtureWriteDb({ invoices: [doc({ status: 'sent' })], invoice_payments: [] }, OWNER);
  const out = await deleteDraftTool.execute!(
    { db, userId: OWNER },
    { id: 'inv-12', label: 'INV-0012', clientName: 'Maria Santos', kind: 'invoice' },
    'action-1',
  );
  assert.equal(out.ok, false);
  assert.equal(db.updates, 0);
});
