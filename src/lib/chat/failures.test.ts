import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearFailures, upsertFailure, type FailureOp } from './failures';

type M = { id: string; content: string; failed?: FailureOp };
const fin = (id: string, content = 'x'): M => ({ id, content, failed: { op: 'finalize' } });

test('a second failure of the same op replaces the bubble, never stacks', () => {
  const once = upsertFailure<M>([{ id: 'u1', content: 'hi' }], fin('a', "couldn't mark it as sent"));
  const twice = upsertFailure(once, fin('b', "couldn't mark it as sent"));
  assert.equal(twice.filter((m) => m.failed).length, 1);
  assert.equal(twice[1].id, 'a'); // same id and position, so its Retry keeps working
});

test('a different op still gets its own bubble', () => {
  const list = upsertFailure<M>([fin('a')], { id: 's', content: 'x', failed: { op: 'send', text: 'job' } });
  assert.equal(list.length, 2);
});

test('send failures are keyed by their text', () => {
  const s = (id: string, text: string): M => ({ id, content: 'x', failed: { op: 'send', text } });
  const l = upsertFailure(upsertFailure<M>([], s('a', 'one')), s('b', 'two'));
  assert.equal(l.length, 2);
  assert.equal(upsertFailure(l, s('c', 'one')).length, 2);
});

test('clearFailures drops stale bubbles but keeps the one being retried', () => {
  const list: M[] = [fin('a'), { id: 'm', content: 'ok' }, fin('b')];
  assert.deepEqual(clearFailures(list, 'finalize').map((m) => m.id), ['m']);
  assert.deepEqual(clearFailures(list, 'finalize', 'b').map((m) => m.id), ['m', 'b']);
  assert.equal(clearFailures(list, 'send').length, 3);
});
