import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATE_TTL_MS, parseStored, parseStoredRow } from './template-store';

const NOW = 1_800_000_000_000;
const good = (o: Record<string, unknown> = {}) => JSON.stringify({
  v: 1, uid: 'u1', savedAt: NOW - 1000, kind: 'quote',
  client: { name: 'Dan Okafor', id: 'c1', address: '12 Elm St', phone: null },
  items: [{ key: 'a', name: 'Deck staining', unit: 'job', unit_price: 450, qty: 1, detail: null, priceSet: true }],
  ...o,
});

test('parseStored: a fresh template for this user round-trips', () => {
  const t = parseStored(good(), 'u1', NOW)!;
  assert.equal(t.kind, 'quote');
  assert.equal(t.client?.name, 'Dan Okafor');
  assert.equal(t.items[0].unit_price, 450);
  assert.equal(t.items[0].priceSet, true);
});

test('parseStored: expired, another user, malformed → null', () => {
  assert.equal(parseStored(good({ savedAt: NOW - TEMPLATE_TTL_MS - 1 }), 'u1', NOW), null);
  assert.equal(parseStored(good(), 'u2', NOW), null);
  assert.equal(parseStored(good(), null, NOW), null);
  assert.equal(parseStored(good({ uid: null }), null, NOW)?.kind, 'quote'); // guest's own
  assert.equal(parseStored('{nope', 'u1', NOW), null);
  assert.equal(parseStored(good({ v: 2 }), 'u1', NOW), null);
  assert.equal(parseStored(good({ kind: 'expense' }), 'u1', NOW), null);
  assert.equal(parseStored(good({ items: [] }), 'u1', NOW), null);
  assert.equal(parseStored(null, 'u1', NOW), null);
});

test('parseStored: cleans bad fields', () => {
  const t = parseStored(good({ items: [{ key: 'a', name: 'X', unit: 'bogus', unit_price: 'NaN', qty: 0 }, 'junk'] }), 'u1', NOW)!;
  assert.equal(t.items.length, 1);
  assert.equal(t.items[0].unit, null);
  assert.equal(t.items[0].unit_price, null);
  assert.equal(t.items[0].qty, 1);
});

test('parseStoredRow: the template row link, scoped and expiring like the template', () => {
  const now = 1_800_000_000_000;
  const raw = (o: object) => JSON.stringify({ uid: 'u1', savedAt: now - 1000, convoId: 'cv1', id: 'inv-1', no: 42, ...o });
  assert.deepEqual(parseStoredRow(raw({}), 'u1', now), { convoId: 'cv1', id: 'inv-1', no: 42 });
  assert.equal(parseStoredRow(raw({}), 'u2', now), null);
  assert.equal(parseStoredRow(raw({ savedAt: now - TEMPLATE_TTL_MS - 1 }), 'u1', now), null);
  assert.equal(parseStoredRow(raw({ id: null }), 'u1', now), null);
  assert.equal(parseStoredRow('{bad', 'u1', now), null);
  assert.equal(parseStoredRow(null, 'u1', now), null);
});
