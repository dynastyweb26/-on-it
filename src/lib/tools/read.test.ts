// resolveClientName: one, many, none, and the exact match that wins.
import test from 'node:test';
import assert from 'node:assert/strict';
import { joinNames, resolveClientName } from './read';

const NAMES = ['Ruth Lawrence', 'Ruth Chen', 'Maria Santos'];

test('one: a name only one person has resolves to that client', () => {
  assert.deepEqual(resolveClientName(NAMES, 'maria'), { kind: 'one', name: 'Maria Santos' });
});

test('many: a name two people have is every one of them, sorted', () => {
  assert.deepEqual(resolveClientName(NAMES, 'ruth'), {
    kind: 'many',
    names: ['Ruth Chen', 'Ruth Lawrence'],
  });
});

test('none: a name nobody has is nobody, never the closest guess', () => {
  assert.deepEqual(resolveClientName(NAMES, 'zebediah'), { kind: 'none' });
});

test('exact wins: the full name resolves to one even when others also match', () => {
  // Both Ruths match the fuzzy rule; the full name is only one of them.
  assert.deepEqual(resolveClientName(NAMES, 'ruth lawrence'), { kind: 'one', name: 'Ruth Lawrence' });
  assert.deepEqual(resolveClientName(NAMES, 'ruth chen'), { kind: 'one', name: 'Ruth Chen' });
});

test('an invoice-only client is a candidate like any other', () => {
  assert.deepEqual(
    resolveClientName(['Ruth Lawrence', 'Ruth Chen'], 'chen'),
    { kind: 'one', name: 'Ruth Chen' },
  );
});

test('case and spacing never decide who a name is', () => {
  assert.deepEqual(resolveClientName(NAMES, '  RUTH   LAWRENCE '), { kind: 'one', name: 'Ruth Lawrence' });
  assert.deepEqual(resolveClientName(['maria santos'], 'Maria Santos'), { kind: 'one', name: 'maria santos' });
});

test('the same client spelled two ways is one candidate, not two people', () => {
  assert.deepEqual(
    resolveClientName(['Ruth  Lawrence', 'ruth lawrence'], 'ruth'),
    { kind: 'one', name: 'Ruth  Lawrence' },
  );
});

test('an empty query matches everyone, so it is never a silent one', () => {
  assert.equal(resolveClientName(NAMES, '   ').kind, 'many');
});

test('the names in an ask-which-one sentence read like English', () => {
  assert.equal(joinNames(['Ruth Chen', 'Ruth Lawrence']), 'Ruth Chen and Ruth Lawrence');
  assert.equal(joinNames(['A', 'B', 'C']), 'A, B and C');
});
