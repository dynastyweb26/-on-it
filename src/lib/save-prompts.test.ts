import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clientPrompt, enqueue, productPrompts, savedLine } from './save-prompts';

test('clientPrompt: unsaved and used twice or more', () => {
  assert.equal(clientPrompt({ name: 'Mike Davis', saved: false }, { invoices: 1, quotes: 0 }), null);
  assert.equal(clientPrompt({ name: 'Mike Davis', saved: true }, { invoices: 3, quotes: 0 }), null);
  assert.equal(clientPrompt(null, { invoices: 3, quotes: 0 }), null);
  assert.equal(clientPrompt({ name: 'Mike Davis', saved: false }, null), null);
  assert.deepEqual(clientPrompt({ name: 'Mike Davis', saved: false }, { invoices: 1, quotes: 1 }),
    { kind: 'client', key: 'client:mike davis', name: 'Mike Davis' });
});

test('productPrompts: priced from the sent lines, junk ignored', () => {
  const lines = [
    { description: 'Deck staining', qty: 1, unit_price: 450 },
    { description: 'Labor', qty: 3, unit_price: 40 },
  ];
  assert.deepEqual(productPrompts(['deck staining', 'Gutters', '', 7], lines), [
    { kind: 'product', key: 'product:deck staining', name: 'deck staining', price: 450 },
    { kind: 'product', key: 'product:gutters', name: 'Gutters', price: null },
  ]);
  assert.deepEqual(productPrompts(null, lines), []);
});

test('enqueue: one prompt per client / item', () => {
  const a = clientPrompt({ name: 'Mike Davis', saved: false }, { invoices: 2, quotes: 0 })!;
  const [b] = productPrompts(['Deck staining'], []);
  assert.deepEqual(enqueue([], null, [a, b, a]), [a, b]);
  assert.deepEqual(enqueue([b], a, [a, b]), [b]);
});

test('savedLine', () => {
  assert.equal(savedLine({ kind: 'client', key: 'k', name: 'Mike Davis' }), 'Saved Mike Davis to Clients.');
  assert.equal(savedLine({ kind: 'product', key: 'k', name: 'Deck staining', price: 450 }), 'Saved Deck staining to Products & Services.');
});
