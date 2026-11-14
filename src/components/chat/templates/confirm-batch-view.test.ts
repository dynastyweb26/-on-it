import test from 'node:test';
import assert from 'node:assert/strict';
import { batchFromProps } from './confirm-batch-view';
import { CONFIRM_BATCH_FIXTURE } from '@/lib/templates/fixtures';

const actions = CONFIRM_BATCH_FIXTURE.actions;

test('each state prop starts the machine in the matching phase', () => {
  assert.equal(batchFromProps('pending', undefined, actions).phase, 'pending');
  assert.equal(batchFromProps('loading', undefined, actions).phase, 'pending');
  assert.equal(batchFromProps('confirming', undefined, actions).phase, 'confirming');
  assert.equal(batchFromProps('done', undefined, actions).phase, 'done');
});

test('partial uses the statuses it is given', () => {
  const s = batchFromProps('partial', ['saved', 'failed', 'saved'], actions);
  assert.equal(s.phase, 'partial');
  assert.deepEqual(s.outcomes, { '0': 'saved', '1': 'failed', '2': 'saved' });
});

test('with no statuses no row is marked failed: nothing is guessed', () => {
  const s = batchFromProps('partial', undefined, actions);
  assert.deepEqual(s.outcomes, {});
});

import { applyConfirmResult } from './confirm-batch-view';
import { beginConfirm, startBatch } from '@/lib/templates/confirm-batch';

const rowsOf = actions.map((a, i) => ({ id: String(i), kind: 'record' as const, summary: a.summary, amount: a.amount }));
const confirming = () => beginConfirm(startBatch(rowsOf));

test('a settled answer paints the server rows; a refusal puts the card back idle', () => {
  const all = actions.map((a) => ({ actionId: a.id, outcome: 'saved' as const }));
  assert.equal(applyConfirmResult(confirming(), 'pending', actions, { kind: 'settled', rows: all }).phase, 'done');
  const one = all.map((r, i) => (i === 1 ? { ...r, outcome: 'failed' as const } : r));
  const partial = applyConfirmResult(confirming(), 'pending', actions, { kind: 'settled', rows: one });
  assert.equal(partial.phase, 'partial');
  assert.deepEqual(partial.outcomes, { '0': 'saved', '1': 'failed', '2': 'saved' });
  assert.equal(applyConfirmResult(confirming(), 'pending', actions, { kind: 'error', message: 'x' }).phase, 'pending');
  assert.equal(applyConfirmResult(confirming(), 'pending', actions, undefined).phase, 'pending');
});

test('a row the server did not answer for is never painted saved', () => {
  const missing = [{ actionId: actions[0].id, outcome: 'saved' as const }];
  assert.equal(applyConfirmResult(confirming(), 'pending', actions, { kind: 'settled', rows: missing }).phase, 'pending');
});

test('only the server saying "already done" moves an errored card to done', () => {
  assert.equal(applyConfirmResult(confirming(), 'pending', actions, { kind: 'error', message: 'x', done: true }).phase, 'done');
});

test('a failed retry returns to partial and keeps the rows already answered', () => {
  const partial = applyConfirmResult(confirming(), 'pending', actions, {
    kind: 'settled',
    rows: actions.map((a, i) => ({ actionId: a.id, outcome: i === 2 ? ('failed' as const) : ('saved' as const) })),
  });
  const retry = beginConfirm(partial);
  const back = applyConfirmResult(retry, 'partial', actions, { kind: 'error', message: 'offline' });
  assert.equal(back.phase, 'partial');
  assert.deepEqual(back.outcomes, partial.outcomes);
});
