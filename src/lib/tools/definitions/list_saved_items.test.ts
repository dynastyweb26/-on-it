import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureDb } from '../fixture-db';
import { listSavedItemsTool, savedItemFixture } from './list_saved_items';

const OWNER = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';

const row = (over: Record<string, unknown> = {}) => ({
  ...savedItemFixture[0],
  user_id: OWNER,
  deleted_at: null,
  ...over,
});

const run = (rows: unknown[], args: unknown = {}) =>
  listSavedItemsTool.handler(
    { db: fixtureDb({ products: rows as never }), userId: OWNER },
    listSavedItemsTool.input.parse(args),
  ) as Promise<{
    match: string;
    count: number;
    ignored: string[];
    rows: Array<{ name: string; amount: string }>;
    items: Array<{ unitPrice: string | null }>;
  }>;

test('filtering by a unit word finds only that unit', async () => {
  const out = await run([row(), row({ id: 'p2', name: 'Hourly labor', unit: 'hour', unit_price: 65 })], { unit: 'hourly' });
  assert.equal(out.count, 1);
  assert.equal(out.rows[0].name, 'Hourly labor');
  assert.equal(out.items[0].unitPrice, '$65.00');
});

test('an unknown unit is reported, not fatal', async () => {
  const out = await run([row()], { unit: 'furlong' });
  assert.equal(out.count, 1);
  assert.deepEqual(out.ignored, ['furlong']);
  assert.equal(out.rows[0].amount, '$85.00 per job');
});

test('text matches the name and detail, and deleted rows never count', async () => {
  const out = await run([
    row(),
    row({ id: 'p2', name: 'Materials', detail: 'Paint and primer' }),
    row({ id: 'gone', name: 'Old thing', deleted_at: '2026-11-01' }),
  ], { text: 'paint' });
  assert.equal(out.count, 1);
  assert.equal(out.rows[0].name, 'Materials');
});

test('another owner’s saved items are invisible', async () => {
  const out = await run([row({ user_id: OTHER, name: 'Foreign' }), row()], { text: 'foreign' });
  assert.equal(out.count, 0);
  assert.equal(out.match, 'none');
});

test('a missing price is No price, never $0.00', async () => {
  const out = await run([row({ unit_price: null })]);
  assert.equal(out.rows[0].amount, 'No price');
  assert.equal(out.items[0].unitPrice, null);
});
