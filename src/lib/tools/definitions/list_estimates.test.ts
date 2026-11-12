import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureDb } from '../fixture-db';
import { listEstimatesTool } from './list_estimates';

const OWNER = '11111111-1111-1111-1111-111111111111';
const row = (n: number, over: Record<string, unknown> = {}) => ({
  id: `est-${n}`, user_id: OWNER, kind: 'quote', invoice_number: n, client_name: 'Mike Alvarez',
  status: 'sent', total: '2400.00', amount_paid: 0, due_date: '2026-11-20',
  created_at: `2026-11-0${Math.min(n, 9)}T00:00:00Z`, deleted_at: null, ...over,
});
const run = (rows: unknown[], args: Record<string, unknown> = {}) =>
  listEstimatesTool.handler({ db: fixtureDb({ invoices: rows as never }), userId: OWNER }, listEstimatesTool.input.parse(args));

test('estimates only, worded as estimates and numbered E-', async () => {
  const out = (await run([row(3), row(1, { kind: 'invoice' })])) as never as {
    count: number; documents: { noun: string; number: string }[]; eyebrow: string;
  };
  assert.equal(out.count, 1);
  assert.equal(out.eyebrow, 'Your estimates');
  assert.equal(out.documents[0].noun, 'estimate');
  assert.equal(out.documents[0].number, 'E-0003');
});

test('filters narrow by client and stay forgiving about status', async () => {
  const out = (await run([row(3), row(4, { client_name: 'Ruth Lawrence' })], { client: 'mike', status: ['banana'] })) as never as {
    count: number; ignored: string[];
  };
  assert.equal(out.count, 1);
  assert.deepEqual(out.ignored, ['banana']);
});

test("another owner's estimates are invisible", async () => {
  const out = (await run([row(3, { user_id: '22222222-2222-2222-2222-222222222222' })])) as never as { count: number; match: string };
  assert.equal(out.count, 0);
  assert.equal(out.match, 'none');
});

test('the list stops at 25 rows but still reports the full count', async () => {
  const rows = Array.from({ length: 40 }, (_, i) => row(i + 1));
  const out = (await run(rows)) as never as { rows: unknown[]; totalCount: number; total: { label: string } };
  assert.equal(out.rows.length, 25);
  assert.equal(out.totalCount, 40);
  assert.equal(out.total.label, '40 estimates');
});
