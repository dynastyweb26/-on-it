// Delete and Undo work like the rest of other income: soft delete only, so the
// row leaves Collected and Undo can put it back. The route must never remove a
// row outright, and never touch a deposit's row.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mergeIncome } from './income';
import { sumOtherIncome } from './other-income';

const ROUTE = readFileSync(
  join(process.cwd(), 'src', 'app', 'api', 'income', 'unattached', 'route.ts'),
  'utf8',
);

const ROW = {
  id: 'other-1',
  amount: '120.00',
  title: 'Side job',
  client_name: null,
  received_on: '2026-11-11',
  classification: 'other_income',
  deposit_id: null,
};

const source = (deleted_at: string | null) => [{ ...ROW, deleted_at }];

test('deleting it removes it from Collected and the Income list', () => {
  assert.equal(sumOtherIncome(source(null)), 120);
  assert.equal(sumOtherIncome(source('2026-11-12T10:00:00.000Z')), 0);
  assert.equal(mergeIncome(null, source('2026-11-12T10:00:00.000Z')).length, 0);
});

test('undoing the delete puts it back in the totals', () => {
  // Restore is the same row with deleted_at null, nothing re-inserted.
  assert.equal(sumOtherIncome(source(null)), 120);
  assert.equal(mergeIncome(null, source(null)).length, 1);
});

test('delete is soft: the row is updated, never removed', () => {
  const start = ROUTE.indexOf('export async function DELETE');
  const end = ROUTE.indexOf('export async function PATCH');
  assert.ok(start > 0 && end > start, 'both handlers exist');
  const del = ROUTE.slice(start, end);
  assert.match(del, /\.update\(\{ deleted_at: new Date\(\)\.toISOString\(\) \}\)/);
  assert.doesNotMatch(del, /\.delete\(/);
  // The owner's own manual row, and nothing else.
  assert.match(del, /\.eq\('user_id', user\.id\)/);
  assert.match(del, /\.is\('deposit_id', null\)/);
  assert.match(del, /fail\('not_found', 404\)/);
});

test('undo clears deleted_at on the same row, idempotently', () => {
  const undo = ROUTE.slice(ROUTE.indexOf('export async function PATCH'));
  assert.match(undo, /\.update\(\{ deleted_at: null \}\)/);
  assert.match(undo, /\.eq\('id', parsed\.data\.id\)/);
  assert.match(undo, /\.eq\('user_id', user\.id\)/);
  assert.match(undo, /\.is\('deposit_id', null\)/);
  assert.doesNotMatch(undo, /\.insert\(/);
  assert.doesNotMatch(undo, /\.delete\(/);
});

test('neither handler uses the service role or an invoice', () => {
  assert.doesNotMatch(ROUTE, /adminClient/);
  assert.doesNotMatch(ROUTE, /from\('invoice_payments'\)/);
  assert.doesNotMatch(ROUTE, /from\('invoices'\)/);
});
