// Pure helpers of the attachment storage layer: the next free position and the
// object path shape the bucket policy depends on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextAttachmentPosition, attachmentObjectPath } from './attachments-client';

test('nextAttachmentPosition: empty → 0, else max + 1', () => {
  assert.equal(nextAttachmentPosition([]), 0);
  assert.equal(nextAttachmentPosition([{ position: 0 }]), 1);
  assert.equal(nextAttachmentPosition([{ position: 0 }, { position: 1 }]), 2);
  // A gap still advances past the highest used slot.
  assert.equal(nextAttachmentPosition([{ position: 0 }, { position: 2 }]), 3);
  assert.equal(nextAttachmentPosition([{ position: 5 }]), 6);
});

test('attachmentObjectPath: ${uid}/${invoiceId}/${uuid}.jpg', () => {
  const p = attachmentObjectPath('user-1', 'inv-9');
  assert.match(p, /^user-1\/inv-9\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/);
});

test('attachmentObjectPath: two calls never collide', () => {
  assert.notEqual(attachmentObjectPath('u', 'i'), attachmentObjectPath('u', 'i'));
});
