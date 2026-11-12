import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureDb } from '../fixture-db';
import { getInvoiceTool } from './get_invoice';

const OWNER = '11111111-1111-1111-1111-111111111111';
const row = (over: Record<string, unknown> = {}) => ({
  id: 'inv-74', user_id: OWNER, kind: 'invoice', invoice_number: 74, client_name: 'Chenyi',
  status: 'overdue', total: '8100.00', amount_paid: 0, due_date: '2026-10-08',
  created_at: '2026-10-01T00:00:00Z', deleted_at: null, line_items: [{}, {}, {}], ...over,
});
const run = (rows: unknown[], args: unknown) =>
  getInvoiceTool.handler({ db: fixtureDb({ invoices: rows as never }), userId: OWNER }, getInvoiceTool.input.parse(args));

test('finds one invoice by number with typed facts and money strings', async () => {
  const out = (await run([row()], { number: 74 })) as never as { match: string; invoice: { total: string; balance: string; lineCount: number } };
  assert.equal(out.match, 'one');
  assert.equal(out.invoice.total, '$8,100.00');
  assert.equal(out.invoice.balance, '$8,100.00');
  assert.equal(out.invoice.lineCount, 3);
});

test('estimates are not invoices; another owner is invisible', async () => {
  assert.equal(((await run([row({ kind: 'quote' })], { number: 74 })) as never as { match: string }).match, 'none');
  assert.equal(((await run([row({ user_id: '22222222-2222-2222-2222-222222222222' })], { number: 74 })) as never as { match: string }).match, 'none');
});

test('no match is none, not an invented record', async () => {
  const out = (await run([row()], { number: 999 })) as never as { match: string; invoice: unknown };
  assert.equal(out.match, 'none');
  assert.equal(out.invoice, null);
});
