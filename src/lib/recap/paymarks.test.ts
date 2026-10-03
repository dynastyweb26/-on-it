import { test } from 'node:test';
import assert from 'node:assert/strict';
import { payMark, segmentInk } from './paymarks';
import { fixturePayload, scenarioPayload, stressWeek } from './fixtures';

test('Zelle, Cash App and card (Stripe) are their simple-icons marks in the brand hex', () => {
  const z = payMark('zelle'), c = payMark('cashapp'), k = payMark('card');
  assert.equal(k.kind === 'brand' && k.icon.title, 'Stripe');
  assert.equal(k.color, '#635BFF');
  assert.equal(z.kind, 'brand');
  assert.equal(z.color, '#6D1ED4');
  assert.equal(c.kind === 'brand' && c.icon.title, 'Cash App');
  assert.equal(c.color, '#00C244');
});

test('cash, check and other are neutral chips with distinct segment colours; unknown → other', () => {
  const n = ['cash', 'check', 'other'].map(payMark);
  assert.ok(n.every((m) => m.kind === 'neutral'));
  assert.equal(new Set(n.map((m) => m.color)).size, 3);
  assert.deepEqual(payMark('venmo'), payMark('other'));
});

test('segment % label: cream on dark brand/data colours, ink on light ones', () => {
  assert.equal(segmentInk('#6D1ED4'), 'cream');   // Zelle
  assert.equal(segmentInk('#00C244'), 'ink');     // Cash App (the prototype used ink too)
  assert.equal(segmentInk('#635BFF'), 'cream');   // Stripe
  assert.equal(segmentInk('#a39a86'), 'ink');
});

test('fixtures: each scenario stores its own payment-method split', () => {
  assert.deepEqual(fixturePayload('busyMonth').paymentMethods.map((m) => m.method), ['zelle', 'card', 'cashapp']);
  assert.deepEqual(fixturePayload('investmentWeek').paymentMethods.map((m) => m.method), ['card', 'zelle']);
  assert.equal(scenarioPayload(stressWeek).paymentMethods.length, 6);
});
