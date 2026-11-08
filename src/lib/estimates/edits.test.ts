import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EditsBody, buildEditsPatch } from './edits';

test('edits allowlist: identity, number, token, status and kind are rejected', () => {
  for (const key of [
    'client_name', 'client_email', 'client_phone', 'client_address',
    'invoice_number', 'public_token', 'status', 'kind', 'finalize_key',
    'user_id', 'converted_from', 'estimate_version', 'approved_at',
  ]) {
    assert.equal(EditsBody.safeParse({ [key]: 'x' }).success, false, `${key} is refused`);
  }
  assert.equal(EditsBody.safeParse({}).success, false, 'an empty save is refused');
});

test('edits allowlist: the content a chat revise changes is accepted', () => {
  const ok = EditsBody.safeParse({
    title: 'Deck',
    line_items: [{ description: 'Deck', qty: 1, unit_price: 100 }],
    notes: 'Gate code 1234',
    tax_rate: 8,
    deposit_type: 'fixed',
    deposit_value: 50,
    due_date: '2026-12-01',
  });
  assert.equal(ok.success, true);
});

test('buildEditsPatch: one patch, totals from the tax and deposit being saved', () => {
  const patch = buildEditsPatch(
    { tax_rate: 0, deposit_type: 'none', deposit_value: null, line_items: [] },
    {
      line_items: [{ description: 'Deck', qty: 1, unit_price: 100 }],
      tax_rate: 10,
      deposit_type: 'fixed',
      deposit_value: 30,
    },
  );
  assert.deepEqual(
    Object.keys(patch).sort(),
    ['deposit_amount', 'deposit_type', 'deposit_value', 'line_items', 'subtotal', 'tax_amount', 'tax_rate', 'total'],
  );
  assert.equal(patch.subtotal, 100);
  assert.equal(patch.tax_amount, 10);
  assert.equal(patch.total, 110);
  assert.equal(patch.deposit_amount, 30);
});

test('buildEditsPatch: a title-only change writes no totals', () => {
  const patch = buildEditsPatch(
    { tax_rate: 8, deposit_type: 'none', deposit_value: null, line_items: [] },
    { title: '  Deck restain  ' },
  );
  assert.deepEqual(patch, { title: 'Deck restain' });
});

test('buildEditsPatch: items keep the row’s own tax and deposit when not restated', () => {
  const patch = buildEditsPatch(
    { tax_rate: 10, deposit_type: 'percentage', deposit_value: 25, line_items: [] },
    { line_items: [{ description: 'Deck', qty: 2, unit_price: 100 }] },
  );
  assert.equal(patch.subtotal, 200);
  assert.equal(patch.tax_amount, 20);
  assert.equal(patch.total, 220);
  assert.equal(patch.deposit_amount, 55);
});
