import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachmentPrefix, deliverableAttachments, isDeliverableAttachment } from './deliverable';

const U = '1f58b401-e1b1-41e9-b11f-df5530872007';
const E = '2d4d4d4d-1111-4222-8333-444444444444';
const OTHER = '9a9a9a9a-1111-4222-8333-444444444444';
const sum = 'a'.repeat(64);

const row = (over: Partial<{ storage_path: string; checksum: string | null }> = {}) => ({
  id: 'row-1',
  storage_path: `${U}/${E}/file.jpg`,
  checksum: sum,
  ...over,
});

test('a checksummed row under this owner and estimate is deliverable', () => {
  assert.equal(attachmentPrefix(U, E), `${U}/${E}/`);
  assert.equal(isDeliverableAttachment(row(), U, E), true);
});

test('a null or malformed checksum is never deliverable', () => {
  assert.equal(isDeliverableAttachment(row({ checksum: null }), U, E), false);
  assert.equal(isDeliverableAttachment(row({ checksum: 'abc' }), U, E), false);
});

test('a foreign owner, foreign estimate or sibling path is never deliverable', () => {
  assert.equal(isDeliverableAttachment(row({ storage_path: `${OTHER}/${E}/file.jpg` }), U, E), false);
  assert.equal(isDeliverableAttachment(row({ storage_path: `${U}/${OTHER}/file.jpg` }), U, E), false);
  assert.equal(isDeliverableAttachment(row({ storage_path: `${U}/${E}extra/file.jpg` }), U, E), false);
  assert.equal(isDeliverableAttachment(row({ storage_path: `${U}/${E}/` }), U, E), false);
});

test('filtering keeps only deliverable rows', () => {
  const rows = [
    row(),
    row({ checksum: null }),
    row({ storage_path: `${OTHER}/${E}/file.jpg` }),
  ];
  assert.deepEqual(deliverableAttachments(rows, U, E).map((r) => r.id), ['row-1']);
});
