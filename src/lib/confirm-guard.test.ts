import { test } from 'node:test';
import assert from 'node:assert/strict';
import { templateHasWork, unsentShareCopy } from './confirm-guard';

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

test('the unsent banner names the document and who has it', () => {
  const invoice = unsentShareCopy('invoice', 'Dana Ruiz');
  assert.equal(invoice.title, "Your invoice went out, but it's still a draft");
  assert.match(invoice.body, /^Dana Ruiz already has the invoice you shared\./);
  assert.equal(unsentShareCopy('estimate', null).body.startsWith('Your client already has the estimate'), true);
});
