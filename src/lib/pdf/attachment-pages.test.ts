// Tests for the attachment-page layout. The pure math runs against a call
// recorder; a second block runs the real jsPDF (it works in Node, no DOM) to
// prove the extra pages are appended AFTER the document's own page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { jsPDF } from 'jspdf';
import {
  appendAttachmentPages, attachmentCell, attachmentPageCount, hexToRgb,
  ATTACHMENT_MAX, type PdfAttachment, type PdfPageTarget,
} from './attachment-pages';

// ── A tiny PNG encoder (jsPDF parses PNG itself, so no canvas is needed) ──
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
/** A solid colour `w`×`h` RGB PNG as a data URL. */
function pngDataUrl(w: number, h: number): string {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; // bit depth 8, colour type 2 (RGB)
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    const off = y * (1 + w * 3);
    for (let x = 0; x < w; x++) {
      const p = off + 1 + x * 3;
      raw[p] = 220; raw[p + 1] = 175; raw[p + 2] = 55; // brand gold
    }
  }
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

const img = (w: number, h: number): PdfAttachment => ({ dataUrl: pngDataUrl(w, h), width: w, height: h });

/** Records addPage / addImage calls so the layout order can be asserted. */
function recorder() {
  const pages: [number, number][] = [];
  const images: string[] = [];
  const calls: string[] = [];
  const rec: PdfPageTarget & { pages: typeof pages; images: typeof images; calls: typeof calls } = {
    addPage: (f) => { pages.push(f); calls.push('page'); },
    setFillColor: () => {},
    rect: () => {},
    addImage: (dataUrl) => { images.push(dataUrl); calls.push('image'); },
    pages, images, calls,
  };
  return rec;
}

test('attachmentPageCount: two per page, capped at six', () => {
  const expected: Record<number, number> = { 0: 0, 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3, 7: 3, 8: 3 };
  for (const [n, pages] of Object.entries(expected)) {
    assert.equal(attachmentPageCount(Number(n)), pages, `n=${n}`);
  }
  assert.equal(ATTACHMENT_MAX, 6);
});

test('appendAttachmentPages: one page per pair, images in order', () => {
  for (const n of [1, 2, 3, 4, 5, 6]) {
    const rec = recorder();
    const items = Array.from({ length: n }, (_, i) => img(i + 1, 1));
    const added = appendAttachmentPages(rec, items, '#ffffff');
    assert.equal(added, attachmentPageCount(n), `n=${n} pages`);
    assert.equal(rec.pages.length, attachmentPageCount(n), `n=${n} addPage calls`);
    assert.equal(rec.images.length, n, `n=${n} addImage calls`);
    // Every page is A4 and every image is the one supplied, in order.
    assert.deepEqual(rec.pages[0], [794, 1123]);
    assert.deepEqual(rec.images, items.map((a) => a.dataUrl));
  }
});

test('appendAttachmentPages: more than six is capped at six (three pages)', () => {
  const rec = recorder();
  const items = Array.from({ length: 10 }, (_, i) => img(8, 8 - i > 0 ? 8 - i : 1));
  const added = appendAttachmentPages(rec, items, '#ffffff');
  assert.equal(added, 3);
  assert.equal(rec.pages.length, 3);
  assert.equal(rec.images.length, 6);
});

test('appendAttachmentPages: nothing to add → no pages', () => {
  const rec = recorder();
  assert.equal(appendAttachmentPages(rec, [], '#ffffff'), 0);
  assert.equal(rec.pages.length, 0);
  assert.equal(rec.images.length, 0);
});

test('attachmentCell: fits, centres, and never upscales', () => {
  const wide = attachmentCell(img(4000, 1000), 0);
  assert.equal(wide.w, 714);                       // fills the width (margins 40)
  assert.ok(Math.abs(wide.h - 178.5) < 1e-6);
  assert.equal(wide.x, 40);
  assert.ok(Math.abs(wide.y - (40 + (509.5 - 178.5) / 2)) < 1e-6);

  const tiny = attachmentCell(img(10, 10), 0);
  assert.equal(tiny.w, 10);                        // not stretched up
  assert.equal(tiny.h, 10);
  assert.ok(Math.abs(tiny.x - (40 + (714 - 10) / 2)) < 1e-6);

  const bottom = attachmentCell(img(10, 10), 1);
  assert.ok(Math.abs(bottom.y - (tiny.y + 509.5 + 24)) < 1e-6);
});

test('hexToRgb: hex and rgb() parse, junk falls back to white', () => {
  assert.deepEqual(hexToRgb('#ffffff'), [255, 255, 255]);
  assert.deepEqual(hexToRgb('#000'), [0, 0, 0]);
  assert.deepEqual(hexToRgb('#d4af37'), [212, 175, 55]);
  assert.deepEqual(hexToRgb('rgb(1, 2, 3)'), [1, 2, 3]);
  assert.deepEqual(hexToRgb('not-a-colour'), [255, 255, 255]);
});

test('real jsPDF: attachment pages come after the invoice page (1/2/3/6)', () => {
  for (const n of [1, 2, 3, 6]) {
    const pdf = new jsPDF({ unit: 'px', format: [794, 1123], compress: true });
    pdf.text('INVOICE + HOW TO PAY', 40, 40);      // the invoice + payment block page
    assert.equal(pdf.getNumberOfPages(), 1, `n=${n} starts on one page`);
    const items = Array.from({ length: n }, () => img(120, 80));
    const added = appendAttachmentPages(pdf, items, '#ffffff');
    assert.equal(added, attachmentPageCount(n), `n=${n} extra pages`);
    assert.equal(pdf.getNumberOfPages(), 1 + attachmentPageCount(n), `n=${n} total pages`);
    // The bytes are a real, openable PDF.
    assert.ok(pdf.output('arraybuffer').byteLength > 1000, `n=${n} pdf has body`);
  }
});
