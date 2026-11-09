import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countPdfPages, fileSizeLabel, pdfMetaLine, pdfSendPhase } from './send-state';

const base = { settled: true, hasFile: true, sending: false, sent: false };

test('building while the file is not settled, and Send does not change that', () => {
  assert.equal(pdfSendPhase({ ...base, settled: false, hasFile: false }), 'building');
});
test('a settled build with no file is the error state', () => {
  assert.equal(pdfSendPhase({ ...base, hasFile: false }), 'error');
});
test('sending wins over everything, including a queued send behind the build', () => {
  assert.equal(pdfSendPhase({ ...base, settled: false, hasFile: false, sending: true }), 'sending');
  assert.equal(pdfSendPhase({ ...base, sending: true, sent: true }), 'sending');
});
test('ready, then sent once it has gone out', () => {
  assert.equal(pdfSendPhase(base), 'ready');
  assert.equal(pdfSendPhase({ ...base, sent: true }), 'sent');
});

test('page count and the meta line', () => {
  const pdf = new TextEncoder().encode('<< /Type /Pages >> << /Type /Page >> << /Type/Page /Parent 1 >>');
  assert.equal(countPdfPages(pdf), 2);
  assert.equal(countPdfPages(new TextEncoder().encode('nothing here')), 0);
  assert.equal(fileSizeLabel(86016), '84 KB');
  assert.equal(pdfMetaLine(1, 86016), '1 page · 84 KB · attached');
  assert.equal(pdfMetaLine(0, 86016), '84 KB · attached');
  assert.equal(pdfMetaLine(3, 0), '3 pages · attached');
});
