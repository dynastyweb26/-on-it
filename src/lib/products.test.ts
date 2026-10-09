import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyName, normalizeProduct, parsePrice, priceText, productSubtitle, usedLine } from './products';

test('normalizeProduct', () => {
  const p = normalizeProduct({ id: 'a', name: 'Deck', unit: 'bogus', unit_price: '450.00', detail: '', use_count: '3' });
  assert.equal(p.unit, 'each');
  assert.equal(p.unit_price, 450);
  assert.equal(p.detail, null);
  assert.equal(p.use_count, 3);
  assert.equal(normalizeProduct({ id: 'b', name: 'X', unit_price: null }).unit_price, null);
});

test('priceText and subtitle', () => {
  assert.equal(priceText({ unit: 'job', unit_price: 450 }), '$450.00');
  assert.equal(priceText({ unit: 'hour', unit_price: 65 }), '$65.00/hr');
  assert.equal(priceText({ unit: 'sq ft', unit_price: 3.25 }), '$3.25/sq ft');
  assert.equal(priceText({ unit: 'each', unit_price: null }), null);
  assert.equal(productSubtitle({ unit: 'each', detail: 'Hang, level and adjust' }), 'Hang, level and adjust · per each');
  assert.equal(productSubtitle({ unit: 'job', detail: null }), 'per job');
});

test('usedLine', () => {
  assert.equal(usedLine({ use_count: 0, last_used_at: null }), 'Not on an invoice yet');
  assert.equal(usedLine({ use_count: 1, last_used_at: null }), 'Used on 1 invoice');
  assert.equal(usedLine({ use_count: 3, last_used_at: '2026-10-02T15:00:00Z' }), 'Used on 3 invoices · last on Oct 2');
});

test('parsePrice', () => {
  assert.equal(parsePrice(''), null);
  assert.equal(parsePrice('$1,234.50'), 1234.5);
  assert.equal(parsePrice('450'), 450);
  assert.ok(Number.isNaN(parsePrice('12.345')));
  assert.ok(Number.isNaN(parsePrice('-5')));
  assert.ok(Number.isNaN(parsePrice('abc')));
  assert.ok(Number.isNaN(parsePrice('99999999')));
});

test('copyName', () => {
  assert.equal(copyName('Deck', ['Deck']), 'Deck (copy)');
  assert.equal(copyName('Deck', ['Deck', 'deck (copy)']), 'Deck (copy 2)');
});
