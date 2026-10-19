// Pure attachment helpers: the 6-image cap and the renumbering plan used when
// an attachment is removed (delete + re-insert, never sequential updates).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ATTACHMENT_MAX, planAttachmentPositions } from './attachment';

test('ATTACHMENT_MAX is six (matches invoice_attachments.position ≤ 5)', () => {
  assert.equal(ATTACHMENT_MAX, 6);
});

test('planAttachmentPositions: no removal keeps the order, numbered from zero', () => {
  const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(planAttachmentPositions(rows), [
    { id: 'a', position: 0 },
    { id: 'b', position: 1 },
    { id: 'c', position: 2 },
  ]);
});

test('planAttachmentPositions: removing the middle closes the gap', () => {
  const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(planAttachmentPositions(rows, 'b'), [
    { id: 'a', position: 0 },
    { id: 'c', position: 1 },
  ]);
});

test('planAttachmentPositions: removing the first shifts the rest down', () => {
  const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(planAttachmentPositions(rows, 'a'), [
    { id: 'b', position: 0 },
    { id: 'c', position: 1 },
  ]);
});

test('planAttachmentPositions: removing the last drops it, others unchanged', () => {
  const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(planAttachmentPositions(rows, 'c'), [
    { id: 'a', position: 0 },
    { id: 'b', position: 1 },
  ]);
});

test('planAttachmentPositions: an unknown id is a no-op', () => {
  const rows = [{ id: 'a' }, { id: 'b' }];
  assert.deepEqual(planAttachmentPositions(rows, 'zzz'), [
    { id: 'a', position: 0 },
    { id: 'b', position: 1 },
  ]);
});

test('planAttachmentPositions: empty input stays empty', () => {
  assert.deepEqual(planAttachmentPositions([], 'a'), []);
});
