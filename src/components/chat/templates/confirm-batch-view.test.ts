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

test('partial fails exactly the row at failIndex and saves the others', () => {
  const s = batchFromProps('partial', 1, actions);
  assert.equal(s.phase, 'partial');
  assert.deepEqual(s.outcomes, { '0': 'saved', '1': 'failed', '2': 'saved' });
});

test('partial with no failIndex still reads as partial', () => {
  assert.equal(batchFromProps('partial', undefined, actions).phase, 'partial');
});
