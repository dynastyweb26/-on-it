import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteExpenseTool } from './delete_expense';
import { fixtureDb } from '../fixture-db';
import { fixtureWriteDb } from '../write-fixture';

const OWNER = '11111111-1111-1111-1111-111111111111';

const expense = (over: Record<string, unknown> = {}) => ({
  id: 'exp-1',
  user_id: OWNER,
  vendor: 'Shell',
  description: 'Fill-up',
  amount: 52.1,
  category: 'fuel',
  tax_deductible: false,
  spent_on: '2026-11-06',
  created_at: '2026-11-06T00:00:00Z',
  deleted_at: null,
  ...over,
});

const prepare = (args: Record<string, unknown>, rows: unknown[] = [expense()]) =>
  deleteExpenseTool.prepare!({ db: fixtureDb({ expenses: rows as never }), userId: OWNER }, args as never);

test('the card names the one expense and moves no money', async () => {
  const prepared = await prepare({ vendor: 'Shell', spent_on: '2026-11-06' });
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  assert.equal(prepared.row.summary, 'Delete expense Shell · Nov 6');
  assert.equal(prepared.row.detail, 'Fuel');
  assert.equal(prepared.row.amount, '', 'deleting an expense moves no money');
});

test('several matches is a question, never a guess', async () => {
  const prepared = await prepare({ vendor: 'Shell' }, [expense(), expense({ id: 'exp-2', vendor: 'Shell North' })]);
  assert.equal(prepared.ok, false);
  if (prepared.ok) return;
  assert.match(prepared.problem, /I found 2 expenses/);
});

test('no match says so', async () => {
  const prepared = await prepare({ vendor: 'Chevron' });
  assert.equal(prepared.ok, false);
});

test('execute is a soft delete: the row stays, deleted_at is set', async () => {
  const db = fixtureWriteDb({ expenses: [expense()] }, OWNER);
  const out = await deleteExpenseTool.execute!({ db, userId: OWNER }, { id: 'exp-1', label: 'Shell · Nov 6' }, 'action-1');
  assert.equal(out.ok, true);
  assert.equal(db.updates, 1);
  assert.equal(db.rows.expenses.length, 1, 'never a hard delete');
  assert.ok((db.rows.expenses[0] as Record<string, unknown>).deleted_at);
});

test('execute refuses an expense that is already deleted', async () => {
  const db = fixtureWriteDb({ expenses: [expense({ deleted_at: '2026-11-07T00:00:00Z' })] }, OWNER);
  const out = await deleteExpenseTool.execute!({ db, userId: OWNER }, { id: 'exp-1', label: 'Shell · Nov 6' }, 'action-1');
  assert.equal(out.ok, false);
  assert.equal(db.updates, 0);
});
