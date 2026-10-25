import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeLike, templateSummary, templateToDraft } from './template-send';
import type { TemplateItem } from './template';

const item = (name: string, price: number | null, x: Partial<TemplateItem> = {}): TemplateItem =>
  ({ key: name, name, unit: null, unit_price: price, qty: 1, detail: null, ...x });
const client = { name: 'Greenway HOA', id: 'c1', address: '40 Park Ave', phone: null };
const WED = new Date(2026, 9, 7);

test('templateToDraft: null until sendable (Q3)', () => {
  assert.equal(templateToDraft('invoice', null, [item('A', 10)], ''), null);
  assert.equal(templateToDraft('invoice', client, [item('', 10)], ''), null);
  assert.equal(templateToDraft('invoice', client, [item('A', 10), item('B', null)], ''), null);
});

test('templateToDraft: the chat draft', () => {
  const d = templateToDraft('quote', client, [
    item('Pressure washing', 200, { unit: 'job' }),
    item('Labor', 40, { unit: 'hour', qty: 3, detail: 'Crew of two' }),
    item('', null),
  ], 'Due Friday\n50% deposit', WED)!;
  assert.equal(d.intent, 'quote');
  assert.equal(d.intent_explicit, true);
  assert.equal(d.client_address, '40 Park Ave');
  assert.equal(d.tax_rate, 0);
  assert.equal(templateToDraft('invoice', client, [item('Labor', 100)], '8% tax', WED)!.tax_rate, 8);
  assert.equal(d.due_date, '2026-10-09');
  assert.equal(d.deposit_type, 'percentage');
  assert.equal(d.deposit_value, 50);
  assert.equal(d.notes, 'Due Friday\n50% deposit');
  assert.deepEqual(d.line_items, [
    { description: 'Pressure washing', qty: 1, unit_price: 200, unit: 'job' },
    { description: 'Labor', qty: 3, unit_price: 40, unit: 'hour', detail: 'Crew of two' },
  ]);
  assert.equal(templateToDraft('invoice', client, [item('A', 10)], '')!.deposit_type, 'none');
  assert.equal(templateToDraft('invoice', client, [item('A', 10)], '')!.notes, null);
});

test('templateSummary', () => {
  const d = templateToDraft('quote', client, [item('Pressure washing', 200, { unit: 'job' }), item('Labor', 40, { unit: 'hour', qty: 3 })], '')!;
  assert.equal(templateSummary(d), 'Estimate for Greenway HOA: Pressure washing $200.00, Labor 3 hr × $40.00');
});

test('escapeLike', () => {
  assert.equal(escapeLike('100% Roofing_Co'), '100\\% Roofing\\_Co');
});

// Spec §5: a person may say quote, quotes, bid or proposal — the app shows
// "estimate" in every one of those cases. The intent value stays 'quote'.
test('typed and voice-transcribed synonyms both render as an estimate', () => {
  const typed = templateSummary({ intent: 'quote', client_name: 'Jordan', line_items: [
    { description: 'Hardware schedule', qty: 1, unit: 'job', unit_price: 1200 },
  ] } as never);
  assert.equal(typed, 'Estimate for Jordan: Hardware schedule $1,200.00');

  // Same shape as a voice transcript: lowercase, no punctuation, "proposal".
  const spoken = templateSummary({ intent: 'quote', client_name: 'jordan', line_items: [
    { description: 'hardware schedule', qty: 1, unit: 'job', unit_price: 1200 },
  ] } as never);
  assert.equal(spoken, 'Estimate for jordan: hardware schedule $1,200.00');

  // An invoice is still an invoice.
  const invoice = templateSummary({ intent: 'invoice', client_name: 'Jordan', line_items: [
    { description: 'Hardware schedule', qty: 1, unit: 'job', unit_price: 1200 },
  ] } as never);
  assert.equal(invoice, 'Invoice for Jordan: Hardware schedule $1,200.00');
});
