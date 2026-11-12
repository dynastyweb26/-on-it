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
