import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEntry } from './list-motion';

test('parseEntry: the mark for this list while fresh', () => {
  const now = 1_800_000_000_000;
  const raw = (o: object) => JSON.stringify({ list: 'clients', key: 'c1', at: now - 1000, ...o });
  assert.equal(parseEntry(raw({}), 'clients', now), 'c1');
  assert.equal(parseEntry(raw({}), 'products', now), null);
  assert.equal(parseEntry(raw({ at: now - 3 * 60 * 1000 }), 'clients', now), null);
  assert.equal(parseEntry(raw({ key: '' }), 'clients', now), null);
  assert.equal(parseEntry('{', 'clients', now), null);
  assert.equal(parseEntry(null, 'clients', now), null);
});
