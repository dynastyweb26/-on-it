import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearPendingAsk, isAskInFlight, pendingAsk, shouldApplyRestore, trackAsk,
} from './pending-ask';
import type { AskOutcome } from '@/lib/ask-client';

const ok: AskOutcome = { kind: 'ok', reply: 'Here you go.', messageId: 'm1' };

test('an ask is in flight for its conversation until it settles', async () => {
  clearPendingAsk();
  let settle: (out: AskOutcome) => void = () => {};
  const promise = new Promise<AskOutcome>((resolve) => { settle = resolve; });
  void trackAsk('convo-1', 'who owes me?', promise);
  assert.equal(isAskInFlight('convo-1'), true);
  assert.equal(pendingAsk('convo-1')?.question, 'who owes me?');
  // Another conversation is not affected.
  assert.equal(isAskInFlight('convo-2'), false);

  settle(ok);
  assert.deepEqual(await promise, ok);
  await Promise.resolve();
  assert.equal(isAskInFlight('convo-1'), false);
  clearPendingAsk();
});

test('a failed ask still clears, so nothing thinks forever', async () => {
  clearPendingAsk();
  const promise = Promise.reject(new Error('offline'));
  void trackAsk('convo-1', 'who owes me?', promise).catch(() => {});
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(isAskInFlight('convo-1'), false);
  clearPendingAsk();
});

test('an empty conversation id tracks nothing', () => {
  clearPendingAsk();
  void trackAsk('', 'x', Promise.resolve(ok));
  void trackAsk(null, 'x', Promise.resolve(ok));
  assert.equal(isAskInFlight(''), false);
  assert.equal(pendingAsk(undefined), undefined);
  clearPendingAsk();
});

test('a restore applies only when nothing is live', () => {
  assert.equal(shouldApplyRestore({ storedIsNewer: true, askInFlight: false, hasThinkingMessage: false }), true);
  // Not newer: never replaces what is on screen.
  assert.equal(shouldApplyRestore({ storedIsNewer: false, askInFlight: false, hasThinkingMessage: false }), false);
  // A request in flight owns the screen, reply included.
  assert.equal(shouldApplyRestore({ storedIsNewer: true, askInFlight: true, hasThinkingMessage: false }), false);
  // A thinking row is a live turn even if the map emptied a moment early.
  assert.equal(shouldApplyRestore({ storedIsNewer: true, askInFlight: false, hasThinkingMessage: true }), false);
});
