// RULES.md §6, item 6: records save one by one, a reminder drafts instead, a
// partial only retries what failed, and undo reverses records while never
// claiming to unsend a message.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  batchHeadline,
  beginConfirm,
  failedCount,
  removeRow,
  settle,
  startBatch,
  undoAll,
  type BatchRow,
} from './confirm-batch';

const pay: BatchRow = {
  id: 'a',
  kind: 'record',
  summary: 'Record Ruth Lawrence paid · Zelle',
  amount: '+$270.00',
};
const remind: BatchRow = {
  id: 'b',
  kind: 'reminder',
  summary: 'Remind Tony about INV-0077',
  amount: '$640.00',
};
const expense: BatchRow = {
  id: 'c',
  kind: 'record',
  summary: 'Log The Home Depot · Supplies',
  amount: '−$39.70',
};

test('a batch starts pending with nothing saved', () => {
  const s = startBatch([pay, remind, expense]);
  assert.equal(s.phase, 'pending');
  assert.deepEqual(s.outcomes, {});
  assert.deepEqual(s.draftRowIds, []);
  assert.deepEqual(batchHeadline(s), {
    head: 'Confirm 3 changes?',
    sub: "Nothing's saved until you confirm.",
  });
});

test('a batch outside 2-4 rows, or with duplicate ids, is refused', () => {
  assert.throws(() => startBatch([pay]), /2-4 rows/);
  assert.throws(
    () => startBatch([pay, remind, expense, { ...expense, id: 'd' }, { ...pay, id: 'e' }]),
    /2-4 rows/,
  );
  assert.throws(() => startBatch([pay, { ...remind, id: 'a' }]), /unique ids/);
});

test('confirm then settle saves each record and drafts each reminder', () => {
  const confirming = beginConfirm(startBatch([pay, remind, expense]));
  assert.equal(confirming.phase, 'confirming');

  const done = settle(
    confirming,
    [pay, remind, expense].map((r) => ({ id: r.id, outcome: 'saved' as const })),
  );
  assert.equal(done.phase, 'done');
  assert.deepEqual(done.draftRowIds, ['b'], 'exactly one draft for one reminder');
  assert.deepEqual(batchHeadline(done), { head: 'All 3 saved.', sub: 'Your books are up to date.' });
});

test('a partial saves the rest, and a retry runs only the failed row', () => {
  const confirming = beginConfirm(startBatch([pay, remind, expense]));
  const partial = settle(confirming, [
    { id: 'a', outcome: 'saved' },
    { id: 'b', outcome: 'saved' },
    { id: 'c', outcome: 'failed' },
  ]);
  assert.equal(partial.phase, 'partial');
  assert.equal(failedCount(partial), 1);
  assert.deepEqual(batchHeadline(partial), {
    head: '2 saved, 1 didn\'t.',
    sub: 'Retry the one that failed.',
  });

  const retry = beginConfirm(partial);
  assert.equal(retry.phase, 'confirming');
  assert.deepEqual(retry.attempting, ['c'], 'only the failed row runs again');

  const done = settle(retry, [{ id: 'c', outcome: 'saved' }]);
  assert.equal(done.phase, 'done');
  assert.deepEqual(done.draftRowIds, ['b'], 'the reminder still has its one draft');
});

test('a row can be removed before confirming', () => {
  const two = removeRow(startBatch([pay, remind, expense]), 'a');
  assert.deepEqual(two.rows.map((r) => r.id), ['b', 'c']);
  assert.equal(two.phase, 'pending');

  const afterConfirm = beginConfirm(startBatch([pay, remind]));
  assert.throws(() => removeRow(afterConfirm, 'a'), /cannot remove/);
});

test('undo all reverses saved records, discards the draft, never unsends', () => {
  const confirming = beginConfirm(startBatch([pay, remind]));
  const done = settle(confirming, [
    { id: 'a', outcome: 'saved' },
    { id: 'b', outcome: 'saved' },
  ]);
  assert.equal(done.draftRowIds.length, 1, 'one reminder yields exactly one draft');

  const undone = undoAll(done);
  assert.deepEqual(undone.reverse, ['a'], 'the saved record is reversed');
  assert.equal(undone.reverse.includes('b'), false, 'a reminder is a draft, not a record');
  assert.equal(undone.discardDraft, true);
  assert.equal(undone.unsend, 'never');
  assert.deepEqual(undone.state.draftRowIds, [], 'no draft survives undo');
  assert.equal(undone.state.phase, 'pending');
  assert.deepEqual(undone.state.outcomes, {});
});

test('undo with no draft discards nothing and still reverses nothing unsaved', () => {
  const undone = undoAll(startBatch([pay, expense]));
  assert.deepEqual(undone.reverse, []);
  assert.equal(undone.discardDraft, false);
  assert.equal(undone.unsend, 'never');
});
