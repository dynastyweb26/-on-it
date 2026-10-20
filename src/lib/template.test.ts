import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clientContactLine, clientDocsLine, clientHistoryVisible, emptyItem, hasExactName, splitClientHistory, usedBeforeLine } from './template';

test('usedBeforeLine', () => {
  assert.equal(usedBeforeLine(1, '2026-09-18T15:00:00Z'), 'Used once · Sep 18');
  assert.equal(usedBeforeLine(2, null), 'Used twice');
  assert.equal(usedBeforeLine(5, '2026-09-18T15:00:00Z'), 'Used 5 times · Sep 18');
});

test('unsaved client history boundary: day 6 and 7 visible, day 8 hidden', () => {
  const now = Date.parse('2026-10-20T12:00:00Z');
  const dayMs = 24 * 60 * 60 * 1000;
  const at = (days: number) => new Date(now - days * dayMs).toISOString();
  assert.equal(clientHistoryVisible(at(6), now), true);
  assert.equal(clientHistoryVisible(at(7), now), true);
  assert.equal(clientHistoryVisible(at(8), now), false);
});

test('all-hidden unsaved clients leave the visible history section empty', () => {
  const now = Date.parse('2026-10-20T12:00:00Z');
  const dayMs = 24 * 60 * 60 * 1000;
  const rows = [
    { name: 'Day 7', last_used_at: new Date(now - 7 * dayMs).toISOString() },
    { name: 'Day 8', last_used_at: new Date(now - 8 * dayMs).toISOString() },
  ];
  const split = splitClientHistory(rows, now);
  assert.deepEqual(split.visible.map((r) => r.name), ['Day 7']);
  assert.deepEqual(split.hidden.map((r) => r.name), ['Day 8']);

  const noVisible = splitClientHistory([rows[1]], now);
  assert.deepEqual(noVisible.visible, []);
  assert.deepEqual(noVisible.hidden.map((r) => r.name), ['Day 8']);
});

test('clientDocsLine', () => {
  assert.equal(clientDocsLine({ invoice_count: 4, quote_count: 0 }), '4 invoices');
  assert.equal(clientDocsLine({ invoice_count: 0, quote_count: 1 }), '1 quote');
  assert.equal(clientDocsLine({ invoice_count: 2, quote_count: 1 }), '2 invoices · 1 quote');
  assert.equal(clientDocsLine({ invoice_count: 0, quote_count: 0 }), 'No invoices yet');
});

test('hasExactName and emptyItem', () => {
  assert.ok(hasExactName(['Mike Davis'], ' mike davis '));
  assert.ok(!hasExactName(['Mike Davis'], 'mike'));
  assert.ok(!hasExactName(['Mike Davis'], '  '));
  const a = emptyItem(); const b = emptyItem();
  assert.notEqual(a.key, b.key);
  assert.equal(a.qty, 1);
  assert.equal(a.name, '');
});

test('clientContactLine', () => {
  assert.equal(clientContactLine({ address: '12 Elm St', phone: '(555) 014-2290' }), '12 Elm St · (555) 014-2290');
  assert.equal(clientContactLine({ address: '12 Elm St\nAustin, TX', phone: null }), '12 Elm St, Austin, TX');
  assert.equal(clientContactLine({ address: null, phone: '555' }), '555');
  assert.equal(clientContactLine({ address: '  ', phone: null }), 'No address or phone on file');
});
