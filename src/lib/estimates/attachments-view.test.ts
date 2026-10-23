import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  attachmentCountLabel,
  attachmentRoomLabel,
  attachmentSheetLabel,
  attachmentSizeLabel,
  attachmentSlots,
  clipCaption,
  uploadProgressLabel,
} from './attachments-view';

test('the 10-file cap counts saved rows AND in-flight uploads', () => {
  assert.deepEqual(attachmentSlots(0, 0), { used: 0, room: 10, atLimit: false });
  assert.deepEqual(attachmentSlots(8, 2), { used: 10, room: 0, atLimit: true });
  assert.deepEqual(attachmentSlots(10, 0), { used: 10, room: 0, atLimit: true });
  // Defensive: never a negative room.
  assert.deepEqual(attachmentSlots(12, 1), { used: 13, room: 0, atLimit: true });
});

test('labels use the design copy', () => {
  assert.equal(attachmentCountLabel(3), '3 of 10');
  assert.equal(attachmentRoomLabel(7), 'Photo or PDF · 7 left');
  assert.equal(attachmentRoomLabel(1), 'Photo or PDF · 1 left');
  assert.equal(attachmentSheetLabel(9), '9 of 10 left');
});

test('captions clip at 60 characters', () => {
  assert.equal(clipCaption('Front door'), 'Front door');
  assert.equal(clipCaption('x'.repeat(80)).length, 60);
});

test('sizes are human-friendly', () => {
  assert.equal(attachmentSizeLabel(0), '');
  assert.equal(attachmentSizeLabel(900), '1 KB');
  assert.equal(attachmentSizeLabel(2048), '2 KB');
  assert.equal(attachmentSizeLabel(1.5 * 1024 * 1024), '1.5 MB');
});

test('upload overlay copy', () => {
  assert.equal(uploadProgressLabel('preparing', 0), 'Preparing');
  assert.equal(uploadProgressLabel('uploading', 42.4), '42%');
  assert.equal(uploadProgressLabel('uploading', 140), '100%');
  assert.equal(uploadProgressLabel('failed', 0), 'Upload failed');
});
