import test from 'node:test';
import assert from 'node:assert/strict';
import { editExpenseTool } from './edit_expense';
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
  editExpenseTool.prepare!({ db: fixtureDb({ expenses: rows as never }), userId: OWNER }, args as never);

test('the card names the expense and the change, old to new', async () => {
  const prepared = await prepare({ vendor: 'Shell', spent_on: '2026-11-06', new_vendor: 'Chevron' });
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  assert.equal(prepared.row.summary, 'Edit expense Shell · Nov 6: vendor Shell to Chevron');
  assert.equal(prepared.row.amount, '');
  assert.deepEqual(prepared.resolved, {
    id: 'exp-1',
    label: 'Shell · Nov 6',
    old: { vendor: 'Shell', description: 'Fill-up', category: 'fuel', spent_on: '2026-11-06' },
    next: { vendor: 'Chevron', description: 'Fill-up', category: 'fuel', spent_on: '2026-11-06' },
  });
});

test('the category word is forgiving: gas means fuel', async () => {
  const prepared = await prepare({ vendor: 'Shell', new_category: 'gas' });
  assert.equal(prepared.ok, false, 'already fuel, so nothing changes');
  const toSupplies = await prepare({ vendor: 'Shell', new_category: 'materials' });
  assert.equal(toSupplies.ok, true);
  if (toSupplies.ok) assert.match(toSupplies.row.summary, /category Fuel to Supplies/);
});

test('two matching expenses is a question naming both', async () => {
  const prepared = await prepare({ vendor: 'Shell' }, [expense(), expense({ id: 'exp-2', vendor: 'Shell North' })]);
  assert.equal(prepared.ok, false);
  if (prepared.ok) return;
  assert.match(prepared.problem, /I found 2 expenses/);
  assert.match(prepared.problem, /Which one\?/);
});

test('the amount is not an input at all', () => {
  const parsed = editExpenseTool.input.safeParse({ vendor: 'Shell', new_amount: 10 });
  assert.equal(parsed.success, false, 'a strict schema refuses a money change');
});

test('execute updates the four editable columns and nothing else', async () => {
  const db = fixtureWriteDb({ expenses: [expense()] }, OWNER);
  const out = await editExpenseTool.execute!(
    { db, userId: OWNER },
    {
      id: 'exp-1', label: 'Shell · Nov 6',
      old: { vendor: 'Shell', description: 'Fill-up', category: 'fuel', spent_on: '2026-11-06' },
      next: { vendor: 'Chevron', description: 'Fill-up', category: 'fuel', spent_on: '2026-11-06' },
    },
    'action-1',
  );
  assert.equal(out.ok, true);
  assert.equal(db.updates, 1);
  const row = db.rows.expenses[0] as Record<string, unknown>;
  assert.equal(row.vendor, 'Chevron');
  assert.equal(row.amount, 52.1, 'the amount is untouched');
});

test('execute refuses when the expense moved or was deleted', async () => {
  const moved = fixtureWriteDb({ expenses: [expense({ vendor: 'BP' })] }, OWNER);
  const first = await editExpenseTool.execute!(
    { db: moved, userId: OWNER },
    {
      id: 'exp-1', label: 'Shell · Nov 6',
      old: { vendor: 'Shell', description: 'Fill-up', category: 'fuel', spent_on: '2026-11-06' },
      next: { vendor: 'Chevron', description: 'Fill-up', category: 'fuel', spent_on: '2026-11-06' },
    },
    'action-1',
  );
  assert.equal(first.ok, false);
  assert.equal(moved.updates, 0);

  const deleted = fixtureWriteDb({ expenses: [expense({ deleted_at: '2026-11-07T00:00:00Z' })] }, OWNER);
  const second = await editExpenseTool.execute!(
    { db: deleted, userId: OWNER },
    {
      id: 'exp-1', label: 'Shell · Nov 6',
      old: { vendor: 'Shell', description: 'Fill-up', category: 'fuel', spent_on: '2026-11-06' },
      next: { vendor: 'Chevron', description: 'Fill-up', category: 'fuel', spent_on: '2026-11-06' },
    },
    'action-1',
  );
  assert.equal(second.ok, false);
});
