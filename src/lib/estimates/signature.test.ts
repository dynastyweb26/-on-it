import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSignature, parsePngSignature } from './signature';
import { MAX_SIGNATURE_PNG_BYTES } from './limits';

const png = (length = 32) => {
  const bytes = Buffer.alloc(length);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes);
  return `data:image/png;base64,${bytes.toString('base64')}`;
};

const jpegDataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

test('a drawn PNG is accepted and stores the data URL', () => {
  const data = png();
  const out = normalizeSignature({ signerName: ' Ada Lovelace ', type: 'draw', data });
  assert.deepEqual(out, { ok: true, signerName: 'Ada Lovelace', type: 'draw', data });
});

test('a JPEG (or any non-PNG) drawing is rejected', () => {
  assert.deepEqual(
    normalizeSignature({ signerName: 'Ada', type: 'draw', data: jpegDataUrl }),
    { ok: false, code: 'signature_not_png' },
  );
});

test('a PNG over 200 KB is rejected as too large', () => {
  const out = normalizeSignature({
    signerName: 'Ada',
    type: 'draw',
    data: png(MAX_SIGNATURE_PNG_BYTES + 1),
  });
  assert.deepEqual(out, { ok: false, code: 'signature_too_large' });
});

test('a missing drawing is rejected', () => {
  assert.deepEqual(normalizeSignature({ signerName: 'Ada', type: 'draw' }), {
    ok: false,
    code: 'signature_data',
  });
});

test('the PNG magic check rejects a valid base64 payload of the wrong type', () => {
  assert.equal(parsePngSignature('data:image/png;base64,aGVsbG8=').ok, false);
});

test('a typed signature is the name, at most 100 characters', () => {
  const out = normalizeSignature({ signerName: 'Ada Lovelace', type: 'type' });
  assert.deepEqual(out, {
    ok: true,
    signerName: 'Ada Lovelace',
    type: 'type',
    data: 'Ada Lovelace',
  });
  assert.deepEqual(normalizeSignature({ signerName: 'x'.repeat(101), type: 'type' }), {
    ok: false,
    code: 'signature_data',
  });
});

test('the signer name is required for every signature type', () => {
  assert.deepEqual(normalizeSignature({ signerName: '   ', type: 'type' }), {
    ok: false,
    code: 'signer_name',
  });
  assert.deepEqual(normalizeSignature({ signerName: 'x'.repeat(121), type: 'draw', data: png() }), {
    ok: false,
    code: 'signer_name',
  });
});
