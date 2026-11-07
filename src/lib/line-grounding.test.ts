import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groundNewLineItems, numbersInText, rejectedNote } from './line-grounding';

const FLOORING = { description: 'Laminate flooring installation, demolishing tiles and carpet removing', qty: 3150, unit_price: 2 };
const STAIRS = { description: 'Staircase renovation', qty: 1, unit_price: 800 };

const CYRIL_TEXTS = [
  'estimate for',
  'dhds',
  'No change the name to Chenyi',
  'Make it 3150 sqft. $2/sqft for (Laminate flooring installation + Demolishing tiles + Carpet removing). Then staircase renovation $800',
  'Actually, let me change something',
  'Decrease the first item by 600',
  'Let me see',
  'No its still 3150 sqft just make sure the New project total is 7500',
];

test('rejects the Trash Removal line Cyril never said (the bug)', () => {
  const trash = { description: 'Trash Removal', qty: 1, unit_price: 1000 };
  const r = groundNewLineItems([FLOORING, STAIRS, trash], [FLOORING, STAIRS], CYRIL_TEXTS);
  assert.deepEqual(r.items, [FLOORING, STAIRS]);
  assert.deepEqual(r.rejected, [trash]);
});

test('rejects the inflated 3700 trash line too', () => {
  const trash = { description: 'Trash Removal', qty: 1, unit_price: 3700 };
  const r = groundNewLineItems([FLOORING, STAIRS, trash], [FLOORING, STAIRS], CYRIL_TEXTS);
  assert.equal(r.rejected.length, 1);
});

test('keeps a new priced line whose price the user stated', () => {
  const trash = { description: 'Trash removal', qty: 1, unit_price: 150 };
  const r = groundNewLineItems([FLOORING, STAIRS, trash], [FLOORING, STAIRS], [...CYRIL_TEXTS, 'add trash removal 150']);
  assert.deepEqual(r.rejected, []);
  assert.equal(r.items.length, 3);
});

test('accepts qty x price when only the line total was said', () => {
  const windows = { description: 'Installed windows', qty: 4, unit_price: 50 };
  const r = groundNewLineItems([windows], [], ['installed 4 windows for 200 total at the Smiths']);
  assert.deepEqual(r.rejected, []);
});

test('accepts spoken number words', () => {
  const fence = { description: 'Fence repair', qty: 1, unit_price: 250 };
  assert.deepEqual(groundNewLineItems([fence], [], ['fixed the fence, two fifty']).rejected, []);
  const deck = { description: 'Deck stain', qty: 1, unit_price: 1200 };
  assert.deepEqual(groundNewLineItems([deck], [], ['deck stain twelve hundred']).rejected, []);
  const gutter = { description: 'Gutter clean', qty: 1, unit_price: 1000 };
  assert.deepEqual(groundNewLineItems([gutter], [], ['gutters, a grand']).rejected, []);
});

test('accepts the k suffix and comma digits', () => {
  assert.ok(numbersInText('charged 1.5k').has(1500));
  assert.ok(numbersInText('total 12,500').has(12500));
});

test('a rename of an existing line at the same price is not new', () => {
  const renamed = { ...STAIRS, description: 'Stair renovation' };
  const r = groundNewLineItems([FLOORING, renamed], [FLOORING, STAIRS], CYRIL_TEXTS);
  assert.deepEqual(r.rejected, []);
});

test('priceless new line needs a word the user said; an invented one is rejected', () => {
  const ok = { description: 'Car wash', qty: 1, unit_price: null };
  assert.deepEqual(groundNewLineItems([ok], [], ['did a car wash for Maria']).rejected, []);
  const bad = { description: 'Gutter cleaning', qty: 1, unit_price: null };
  assert.deepEqual(groundNewLineItems([bad], [], ['did a car wash for Maria']).rejected, [bad]);
});

test('the model prior reply is not a source: only user turns are passed in', () => {
  const trash = { description: 'Trash Removal', qty: 1, unit_price: 1000 };
  // 1000 appears only in an assistant reply, which the caller excludes.
  const r = groundNewLineItems([trash], [], ['estimate for Chenyi, flooring 2 per sqft']);
  assert.deepEqual(r.rejected, [trash]);
});

test('note names what was left out', () => {
  assert.equal(rejectedNote([]), '');
  assert.match(rejectedNote([{ description: 'Trash Removal', qty: 1, unit_price: 1000 }]), /^I left out "Trash Removal"/);
});
