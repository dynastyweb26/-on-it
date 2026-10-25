import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tagFor } from './doc-tags';

test('tagFor', () => {
  assert.equal(tagFor({ kind: 'quote', status: 'sent', due_date: null }, true).text, 'CONVERTED');
  assert.equal(tagFor({ kind: 'quote', status: 'sent', due_date: null, approved_at: '2026-10-22T12:00:00Z' }, false).text, 'SIGNED');
  assert.equal(tagFor({ kind: 'quote', status: 'sent', due_date: null, approved_at: '2026-10-22T12:00:00Z' }, true).text, 'CONVERTED');
  assert.equal(tagFor({ kind: 'invoice', status: 'sent', due_date: '2026-10-15' }, false).text, 'DUE OCT 15');
  assert.equal(tagFor({ kind: 'invoice', status: 'sent', due_date: '2026-10-15', viewed_at: 'x' }, false).icon, 'visibility');
  assert.equal(tagFor({ kind: 'quote', status: 'sent', due_date: null, valid_until: '2026-11-20' }, false, '2026-10-24').text, 'VALID UNTIL NOV 20');
  assert.equal(tagFor({ kind: 'quote', status: 'sent', due_date: null, valid_until: '2026-10-01' }, false, '2026-10-24').text, 'SENT');
  assert.equal(tagFor({ kind: 'invoice', status: 'paid', due_date: null }, false).text, 'PAID');
  assert.equal(tagFor({ kind: 'invoice', status: 'weird', due_date: null }, false).icon, 'history');
});
