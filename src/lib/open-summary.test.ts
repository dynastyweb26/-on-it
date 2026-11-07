import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openSummary } from './open-summary';

const fmt = (n: number) => `$${n.toFixed(2)}`;

test('a lone draft is a draft, not "1 open · $0.00"', () => {
  assert.equal(openSummary([{ status: 'draft', owed: 0 }], fmt), '1 draft');
});

test('drafts never count toward N or the sum', () => {
  assert.equal(
    openSummary([{ status: 'sent', owed: 310 }, { status: 'draft', owed: 0 }, { status: 'draft', owed: 0 }], fmt),
    '1 open · $310.00 · 2 drafts',
  );
});

test('sent and overdue both count', () => {
  assert.equal(openSummary([{ status: 'sent', owed: 100 }, { status: 'overdue', owed: 50 }], fmt), '2 open · $150.00');
});

test('nothing at all keeps the zero line', () => {
  assert.equal(openSummary([], fmt), '0 open · $0.00');
});
