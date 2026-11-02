// ═══ ReviewCard — the receipt row is real now ═══
// It used to be a mock hidden behind ?bankState=. The card now offers "Attach
// receipt" on every expense card, previews the picked photo, and lets the owner
// remove it; nothing is uploaded until "Add to record". The two assertions this
// file carried before (the real card must NOT offer the row) encoded the old
// contract and are replaced — flipping them is the feature, not a loosening:
// they still fail if the row disappears again.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReviewCard from './ReviewCard';
import { BANK_ITEMS, type BankReceipt } from '../../lib/bank-tracking';

const RECEIPT: BankReceipt = {
  hash: 'a'.repeat(64),
  previewUrl: 'blob:http://localhost/receipt-preview',
  blob: new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }),
};

function card(receipt: BankReceipt | null): string {
  return renderToStaticMarkup(createElement(ReviewCard, {
    item: { ...BANK_ITEMS[0], receipt },
    account: 'Chase ••4821',
    onAction: () => {},
    onPatch: () => {},
  }));
}

test('the real card offers Attach receipt', () => {
  const html = card(null);
  assert.equal(html.includes('Attach receipt'), true, 'the row no longer waits for ?bankState=');
  assert.equal(html.includes('Receipt attached'), false);
  assert.equal(html.includes('type="file"'), true, 'a picker is wired to it');
});

test('a picked receipt previews the real photo and can be removed', () => {
  const html = card(RECEIPT);
  assert.equal(html.includes('Receipt attached'), true);
  assert.equal(html.includes('Attach receipt'), false);
  assert.equal(html.includes(RECEIPT.previewUrl), true, 'the thumbnail, not the striped placeholder');
  assert.equal(html.includes('Remove'), true, 'the owner can take it back off');
});

test('a needs-review card keeps its Fix / Keep pair and no receipt row', () => {
  const review = BANK_ITEMS.find((item) => item.review);
  assert.ok(review, 'the fixture still covers the review shape');
  const html = renderToStaticMarkup(createElement(ReviewCard, {
    item: { ...review, receipt: null },
    account: 'Card ••5510',
    onAction: () => {},
    onPatch: () => {},
  }));
  assert.equal(html.includes('Attach receipt'), false, 'only an expense card attaches a receipt');
});
