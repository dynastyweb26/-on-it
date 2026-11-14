import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureDb } from '../fixture-db';
import { expenseFixture, getExpenseTool } from './get_expense';

const OWNER = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';

const row = (over: Record<string, unknown> = {}) => ({
  user_id: OWNER,
  ...expenseFixture(),
  ...over,
});

const run = (rows: unknown[], args: unknown) =>
  getExpenseTool.handler(
    { db: fixtureDb({ expenses: rows as never }), userId: OWNER },
    getExpenseTool.input.parse(args),
  ) as Promise<{
    match: string;
    count: number;
    rows: unknown[];
    reason?: string;
    expense: { id: string; amount: string; vendor: string | null } | null;
  }>;

test('an id finds exactly that expense', async () => {
  const out = await run([row(), row({ id: 'exp-2', vendor: 'Exxon' })], { id: 'exp-2' });
  assert.equal(out.match, 'one');
  assert.equal(out.expense?.id, 'exp-2');
  assert.equal(out.expense?.vendor, 'Exxon');
});

test('no id and no word returns nothing with a reason, never every expense', async () => {
  const out = await run([row(), row({ id: 'exp-2', vendor: 'Exxon' })], {});
  assert.equal(out.match, 'none');
  assert.equal(out.count, 0);
  assert.equal(out.expense, null);
  assert.deepEqual(out.rows, []);
  assert.match(out.reason ?? '', /vendor, a description or a category word/);
});

test('a vendor or category word finds the matching expense', async () => {
  const shell = await run([row(), row({ id: 'exp-2', vendor: 'Exxon', category: 'fuel' })], { description: 'shell' });
  assert.equal(shell.expense?.id, 'exp-1');

  const gas = await run([row({ category: 'food', vendor: 'Diner' }), row()], { description: 'fuel' });
  assert.equal(gas.expense?.id, 'exp-1');
  assert.equal(gas.expense?.amount, '$52.10');
});

test('several matches are returned, not picked for the owner', async () => {
  const out = await run([
    row(),
    row({ id: 'exp-2', vendor: 'Shell North' }),
  ], { description: 'shell' });
  assert.equal(out.match, 'many');
  assert.equal(out.count, 2);
  assert.equal(out.expense, null);
});

test('another owner and a deleted expense never match', async () => {
  const out = await run([
    row({ user_id: OTHER }),
    row({ id: 'gone', deleted_at: '2026-11-07' }),
  ], { description: 'shell' });
  assert.equal(out.match, 'none');
  assert.equal(out.expense, null);
});
