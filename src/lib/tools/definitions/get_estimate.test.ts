import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureDb } from '../fixture-db';
import { getEstimateTool } from './get_estimate';

const OWNER = '11111111-1111-1111-1111-111111111111';
const row = (over: Record<string, unknown> = {}) => ({
  id: 'est-3', user_id: OWNER, kind: 'quote', invoice_number: 3, client_name: 'Mike Alvarez',
  status: 'sent', total: '2400.00', amount_paid: 0, due_date: '2026-11-20',
  created_at: '2026-11-01T00:00:00Z', deleted_at: null, line_items: [{}, {}], ...over,
});
const run = (rows: unknown[], args: unknown) =>
  getEstimateTool.handler({ db: fixtureDb({ invoices: rows as never }), userId: OWNER }, getEstimateTool.input.parse(args));

test('finds one estimate, worded and numbered as one', async () => {
  const out = (await run([row()], { number: 3 })) as never as {
    match: string; estimate: { noun: string; number: string; total: string; lineCount: number };
  };
  assert.equal(out.match, 'one');
  assert.equal(out.estimate.noun, 'estimate');
  assert.equal(out.estimate.number, 'E-0003');
  assert.equal(out.estimate.total, '$2,400.00');
  assert.equal(out.estimate.lineCount, 2);
});

test('an invoice with the same number is not an estimate', async () => {
  const out = (await run([row({ kind: 'invoice' })], { number: 3 })) as never as { match: string };
  assert.equal(out.match, 'none');
});

test('another owner cannot be read', async () => {
  const out = (await run([row({ user_id: '22222222-2222-2222-2222-222222222222' })], { number: 3 })) as never as { match: string };
  assert.equal(out.match, 'none');
});

test('a missing estimate returns null, not an invented record', async () => {
  const out = (await run([row()], { number: 8 })) as never as { match: string; estimate: unknown };
  assert.equal(out.match, 'none');
  assert.equal(out.estimate, null);
});
