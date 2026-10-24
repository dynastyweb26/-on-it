import { test } from 'node:test';
import assert from 'node:assert/strict';
import { docNoun, docPrefix, formatDocNumber } from './documents';

// ESTIMATES-DESIGN-SPEC §5: the visible noun is "Estimate" and the prefix is
// "E"; `kind` stays 'quote' in the database and in every route.

test('estimates are named Estimate and numbered E-####', () => {
  assert.equal(docNoun('quote'), 'Estimate');
  assert.equal(docPrefix('quote'), 'E');
  assert.equal(formatDocNumber('quote', 3), 'E-0003');
  assert.equal(formatDocNumber('quote', 1234), 'E-1234');
});

test('invoices keep their own name and prefix', () => {
  assert.equal(docNoun('invoice'), 'Invoice');
  assert.equal(docPrefix('invoice'), 'INV');
  assert.equal(formatDocNumber('invoice', 7), 'INV-0007');
});

test('no kind ever formats as Q-', () => {
  for (const kind of ['quote', 'invoice', 'expense', null, undefined, '']) {
    assert.ok(!formatDocNumber(kind as never, 1).startsWith('Q-'));
  }
  assert.equal(docNoun(null), 'Invoice');
});
