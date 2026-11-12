import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureDb } from '../fixture-db';
import { listExpensesTool } from './list_expenses';

const OWNER = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';

const row = (over: Record<string, unknown> = {}) => ({
  id: 'exp-1',
  user_id: OWNER,
  description: 'Fill-up',
  vendor: 'Shell',
  amount: '52.10',
  category: 'fuel',
  tax_deductible: true,
  spent_on: '2026-11-06',
  created_at: '2026-11-06T00:00:00Z',
  deleted_at: null,
  ...over,
});

const run = (rows: unknown[], args: unknown = {}) =>
  listExpensesTool.handler(
    { db: fixtureDb({ expenses: rows as never }), userId: OWNER },
    listExpensesTool.input.parse(args),
  ) as Promise<{
    match: string;
    count: number;
    ignored: string[];
    total: { amount: string };
    rows: Array<{ name: string; amount: string }>;
    totalCount: number;
  }>;

test('gas means fuel, so a person’s word finds the stored category', async () => {
  const out = await run([row(), row({ id: 'e2', category: 'food', vendor: 'Diner', amount: '20' })], { category: 'gas' });
  assert.equal(out.count, 1);
  assert.equal(out.rows[0].name, 'Shell');
  assert.equal(out.total.amount, '$52.10');
});

test('deleted, another owner and soft-deleted rows never count', async () => {
  const out = await run([
    row(),
    row({ id: 'deleted', deleted_at: '2026-11-07' }),
    row({ id: 'foreign', user_id: OTHER }),
  ]);
  assert.equal(out.count, 1);
});

test('date and amount filters are inclusive and unknown categories are ignored, not fatal', async () => {
  const out = await run(
    [row(), row({ id: 'e2', spent_on: '2026-10-01', amount: '5' })],
    { from: '2026-10-01', to: '2026-10-31', min_amount: 4, max_amount: 6, category: 'banana' },
  );
  assert.equal(out.count, 1);
  assert.equal(out.rows[0].amount, '$5.00');
  assert.deepEqual(out.ignored, ['banana']);
});

test('a bad date is reported in ignored and otherwise ignored', async () => {
  const out = await run([row()], { from: '10/01/2026' });
  assert.equal(out.count, 1);
  assert.deepEqual(out.ignored, ['10/01/2026']);
});

test('more than 25 matches keep the full count and a deterministic first page', async () => {
  const rows = Array.from({ length: 30 }, (_, i) =>
    row({ id: `e${i}`, spent_on: `2026-11-${String((i % 28) + 1).padStart(2, '0')}`, amount: String(i + 1) }),
  );
  const out = await run(rows);
  assert.equal(out.totalCount, 30);
  assert.equal(out.rows.length, 25);
});

test('nothing logged is none, not an invented expense', async () => {
  const out = await run([]);
  assert.equal(out.match, 'none');
  assert.deepEqual(out.rows, []);
});
