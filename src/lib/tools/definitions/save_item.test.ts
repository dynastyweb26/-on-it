import test from 'node:test';
import assert from 'node:assert/strict';
import { saveItemTool } from './save_item';
import { fixtureDb } from '../fixture-db';
import { fixtureWriteDb } from '../write-fixture';

const OWNER = '11111111-1111-1111-1111-111111111111';

const product = (over: Record<string, unknown> = {}) => ({
  id: 'prod-1',
  user_id: OWNER,
  name: 'Service call',
  unit: 'job',
  unit_price: 85,
  detail: null,
  saved_at: '2026-10-01T00:00:00Z',
  deleted_at: null,
  ...over,
});

const prepare = (args: Record<string, unknown>, products: unknown[] = []) =>
  saveItemTool.prepare!({ db: fixtureDb({ products: products as never }), userId: OWNER }, args as never);

test('a new item is added with its price, composed by the server', async () => {
  const prepared = await prepare({ name: 'Pressure wash', price: 250, unit: 'job' });
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  assert.equal(prepared.row.summary, 'Add item Pressure wash');
  assert.equal(prepared.row.amount, '$250.00/job');
  assert.equal((prepared.resolved as { id: string | null }).id, null);
});

test('a saved item is updated in place, old price to new', async () => {
  const prepared = await prepare({ name: 'service call', price: 95 }, [product()]);
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  assert.match(prepared.row.summary, /Update item Service call/);
  assert.match(prepared.row.summary, /\$85\.00\/job to \$95\.00\/job/);
  assert.equal(prepared.row.amount, '$95.00/job', 'the new price is the card’s figure');
});

test('an unsaved history row is saved instead of duplicated', async () => {
  const prepared = await prepare({ name: 'Service call', price: 95 }, [product({ saved_at: null })]);
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  assert.equal(prepared.row.summary, 'Save item Service call');
  assert.equal(prepared.row.amount, '$95.00/job');
  assert.equal((prepared.resolved as { id: string }).id, 'prod-1');
});

test('saving the same details twice is refused, not a no-op card', async () => {
  const prepared = await prepare({ name: 'Service call', price: 85 }, [product()]);
  assert.equal(prepared.ok, false);
});

test('execute inserts one row with saved_at set', async () => {
  const db = fixtureWriteDb({ products: [] }, OWNER);
  const out = await saveItemTool.execute!(
    { db, userId: OWNER },
    { id: null, name: 'Pressure wash', unit: 'job', unitPrice: 250, detail: null, old: null },
    'action-1',
  );
  assert.equal(out.ok, true);
  assert.equal(db.inserts, 1);
  const row = db.rows.products[0] as Record<string, unknown>;
  assert.equal(row.unit_price, 250);
  assert.ok(row.saved_at);
});

test('execute refuses when the saved item changed since the card', async () => {
  const db = fixtureWriteDb({ products: [product({ unit_price: 99 })] }, OWNER);
  const out = await saveItemTool.execute!(
    { db, userId: OWNER },
    { id: 'prod-1', name: 'Service call', unit: 'job', unitPrice: 95, detail: null, old: { unit: 'job', unitPrice: 85, detail: null } },
    'action-1',
  );
  assert.equal(out.ok, false);
  assert.equal(db.updates, 0);
});
