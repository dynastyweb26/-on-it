import { test } from 'node:test';
import assert from 'node:assert/strict';
import { payMark, segmentInk } from './paymarks';
import { fixturePayload, scenarioPayload, stressWeek } from './fixtures';

test('Zelle and Cash App are their simple-icons marks in the brand hex', () => {
  const z = payMark('zelle'), c = payMark('cashapp');
  assert.equal(z.kind, 'brand');
  assert.equal(z.color, '#6D1ED4');
  assert.equal(c.kind === 'brand' && c.icon.title, 'Cash App');
  assert.equal(c.color, '#00C244');
});

test('card, cash, check and other are neutral chips with distinct segment colours; unknown → other', () => {
  const n = ['card', 'cash', 'check', 'other'].map(payMark);
  assert.ok(n.every((m) => m.kind === 'neutral'));
  assert.equal(new Set(n.map((m) => m.color)).size, 4);
  assert.deepEqual(payMark('venmo'), payMark('other'));
});

test('segment % label: cream on dark brand/data colours, ink on light ones', () => {
  assert.equal(segmentInk('#6D1ED4'), 'cream');   // Zelle
  assert.equal(segmentInk('#00C244'), 'ink');     // Cash App (the prototype used ink too)
  assert.equal(segmentInk('#5b77a8'), 'cream');
  assert.equal(segmentInk('#a39a86'), 'ink');
});

test('fixtures: each scenario stores its own payment-method split', () => {
  assert.deepEqual(fixturePayload('busyMonth').paymentMethods.map((m) => m.method), ['zelle', 'card', 'cashapp']);
  assert.deepEqual(fixturePayload('investmentWeek').paymentMethods.map((m) => m.method), ['card', 'zelle']);
  assert.equal(scenarioPayload(stressWeek).paymentMethods.length, 6);
});
