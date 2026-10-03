import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clientStatus, groupByLetter, initials, letterOf, matchesQuery, normalizeSummary } from './clients';

const base = normalizeSummary({ id: 'x', name: 'Dan', saved: true });

test('normalizeSummary turns numeric strings into numbers', () => {
  const s = normalizeSummary({ id: 'a', name: 'A', saved: true, open_balance: '1280.00', open_count: 1 });
  assert.equal(s.open_balance, 1280);
  assert.equal(s.overdue_balance, 0);
});

test('clientStatus: overdue beats open beats quotes out', () => {
  assert.deepEqual(clientStatus({ ...base, doc_count: 2, overdue_count: 1, overdue_balance: 2150, open_count: 2, open_balance: 2460 }),
    { text: '1 overdue · $2,150.00', tone: 'overdue' });
  assert.equal(clientStatus({ ...base, doc_count: 1, open_count: 1, open_balance: 1280 }).text, '1 open · $1,280.00');
  assert.equal(clientStatus({ ...base, doc_count: 1, quotes_out: 1 }).text, '1 quote out');
  assert.equal(clientStatus({ ...base, doc_count: 3 }).text, 'Paid up');
  assert.equal(clientStatus(base).text, 'No invoices yet');
});

test('initials', () => {
  assert.equal(initials('Dan Okafor'), 'DO');
  assert.equal(initials('brightside dental clinic'), 'BD');
  assert.equal(initials('Cyril'), 'CY');
  assert.equal(initials('  '), '?');
});

test('letterOf and groupByLetter', () => {
  assert.equal(letterOf('élan'), 'E');
  assert.equal(letterOf('3M Co'), '#');
  const g = groupByLetter(['bob', 'Ana', '3M', 'Ben', 'carl'], (s) => s);
  assert.deepEqual(g.map((x) => x.letter), ['A', 'B', 'C', '#']);
  assert.deepEqual(g[1].rows, ['Ben', 'bob']);
});

test('matchesQuery: every word, any order, case-insensitive', () => {
  assert.ok(matchesQuery('Dan Okafor', 'oka'));
  assert.ok(matchesQuery('Dan Okafor', 'okafor dan'));
  assert.ok(!matchesQuery('Dan Okafor', 'dan smith'));
  assert.ok(matchesQuery('Dan Okafor', '   '));
});
