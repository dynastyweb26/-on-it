import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carryUnitDetail, normalizeLineDetail, normalizeLineUnit, qtyText, unitLabel } from './line-units';

test('normalizeLineUnit', () => {
  assert.equal(normalizeLineUnit('hour'), 'hour');
  assert.equal(normalizeLineUnit(' Hours '), 'hour');
  assert.equal(normalizeLineUnit('hr'), 'hour');
  assert.equal(normalizeLineUnit('sqft'), 'sq ft');
  assert.equal(normalizeLineUnit('square feet'), 'sq ft');
  assert.equal(normalizeLineUnit('job'), 'job');
  assert.equal(normalizeLineUnit('each'), 'each');
  assert.equal(normalizeLineUnit('<script>'), null);
  assert.equal(normalizeLineUnit(null), null);
  assert.equal(normalizeLineUnit(3), null);
});

test('normalizeLineDetail', () => {
  assert.equal(normalizeLineDetail('  Two coats  '), 'Two coats');
  assert.equal(normalizeLineDetail('   '), null);
  assert.equal(normalizeLineDetail(null), null);
  assert.equal(normalizeLineDetail('x'.repeat(400))?.length, 300);
});

test('qtyText and unitLabel', () => {
  assert.equal(qtyText(2, 'hour'), '2 hr');
  assert.equal(qtyText(120, 'sq ft'), '120 sq ft');
  assert.equal(qtyText(1, 'job'), '1 job');
  assert.equal(qtyText(3, 'each'), '3');
  assert.equal(qtyText(3, null), '3');
  assert.equal(unitLabel(undefined), '');
});

test('carryUnitDetail: model unit wins, draft fills the rest, detail only from draft', () => {
  const draft = [{ description: 'Deck staining', qty: 1, unit_price: 450, unit: 'job', detail: 'Two coats' }];
  assert.deepEqual(carryUnitDetail('deck staining ', null, draft), { unit: 'job', detail: 'Two coats' });
  assert.deepEqual(carryUnitDetail('Deck staining', 'hour', draft), { unit: 'hour', detail: 'Two coats' });
  assert.deepEqual(carryUnitDetail('Labor', 'hours', draft), { unit: 'hour' });
  assert.deepEqual(carryUnitDetail('Labor', 'bogus', null), {});
});
