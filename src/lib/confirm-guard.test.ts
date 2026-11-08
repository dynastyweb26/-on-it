import { test } from 'node:test';
import assert from 'node:assert/strict';
import { templateHasWork } from './confirm-guard';

test('an empty template closes without asking', () => {
  assert.equal(templateHasWork(null), false);
  assert.equal(templateHasWork({}), false);
  assert.equal(templateHasWork({ client_name: '   ', line_items: [] }), false);
  assert.equal(templateHasWork({ line_items: [{ name: ' ', unit_price: 0 }] }), false);
});

test('a client, a named item or a price is work worth keeping', () => {
  assert.equal(templateHasWork({ client_name: 'Dana Ruiz' }), true);
  assert.equal(templateHasWork({ line_items: [{ name: 'Faucet swap' }] }), true);
  assert.equal(templateHasWork({ line_items: [{ name: '', unit_price: 120 }] }), true);
});
