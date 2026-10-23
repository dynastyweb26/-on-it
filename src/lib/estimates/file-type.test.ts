import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectFileType,
  extensionFor,
  validateAttachmentBytes,
  validateDeclaredAttachment,
} from './file-type';
import { MAX_ATTACHMENT_BYTES } from './limits';

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const pdf = Buffer.from('%PDF-1.7\n');
const heic = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x18]),
  Buffer.from('ftypheic'),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
]);

test('detects the four input types', () => {
  assert.equal(detectFileType(jpeg), 'image/jpeg');
  assert.equal(detectFileType(png), 'image/png');
  assert.equal(detectFileType(pdf), 'application/pdf');
  assert.equal(detectFileType(heic), 'image/heic');
  assert.equal(detectFileType(Buffer.from('hello')), null);
});

test('extensions follow the detected type', () => {
  assert.equal(extensionFor('image/jpeg'), 'jpg');
  assert.equal(extensionFor('image/png'), 'png');
  assert.equal(extensionFor('application/pdf'), 'pdf');
});

test('accepted files report the detected type, not the client claim', () => {
  assert.deepEqual(validateAttachmentBytes(jpeg, 'application/pdf'), {
    ok: true,
    mime: 'image/jpeg',
    ext: 'jpg',
    sizeBytes: jpeg.length,
  });
});

test('HEIC is refused with its own code', () => {
  assert.deepEqual(validateAttachmentBytes(heic, 'image/heic'), {
    ok: false,
    code: 'heic_not_converted',
  });
});

test('oversize and empty payloads are refused', () => {
  assert.deepEqual(validateAttachmentBytes(Buffer.alloc(0)), { ok: false, code: 'empty' });
  assert.deepEqual(validateAttachmentBytes(Buffer.alloc(MAX_ATTACHMENT_BYTES + 1)), {
    ok: false,
    code: 'too_large',
  });
});

test('unknown bytes are refused', () => {
  assert.deepEqual(validateAttachmentBytes(Buffer.from('not a file')), {
    ok: false,
    code: 'unsupported_type',
  });
});

test('presign validates the declared type and size', () => {
  assert.deepEqual(validateDeclaredAttachment('application/pdf', 1000), {
    ok: true,
    mime: 'application/pdf',
    ext: 'pdf',
  });
  assert.deepEqual(validateDeclaredAttachment('image/heic', 1000), {
    ok: false,
    code: 'unsupported_type',
  });
  assert.deepEqual(validateDeclaredAttachment('image/png', MAX_ATTACHMENT_BYTES + 1), {
    ok: false,
    code: 'too_large',
  });
});
