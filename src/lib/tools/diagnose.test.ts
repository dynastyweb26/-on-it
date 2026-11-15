import test from 'node:test';
import assert from 'node:assert/strict';
import { noToolLog, PROSE_LOG_MAX } from './diagnose';

const base = { toolRuns: [], budgetExhausted: false, calls: 1, replyText: 'Tap Confirm on the card.' };

test('a turn with no tool run names why and carries the model prose', () => {
  assert.deepEqual(noToolLog(base), {
    reason: 'model_no_tool',
    prose: 'Tap Confirm on the card.',
    calls: 1,
  });
});

test('a turn that ran a tool logs nothing: it is already visible', () => {
  assert.equal(noToolLog({ ...base, toolRuns: [{ name: 'unpaid', status: 'ok' }] as never }), null);
});

test('the budget and an empty reply get their own reasons', () => {
  assert.equal(noToolLog({ ...base, budgetExhausted: true })?.reason, 'budget_exhausted');
  assert.equal(noToolLog({ ...base, replyText: '   ' })?.reason, 'model_said_nothing');
});

test('the prose is cut to 200 characters', () => {
  const long = 'a'.repeat(PROSE_LOG_MAX + 50);
  assert.equal(noToolLog({ ...base, replyText: long })?.prose.length, PROSE_LOG_MAX);
});
