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

function card(
  receipt: BankReceipt | null,
  extra: { busy?: boolean; error?: string | null } = {},
): string {
  return renderToStaticMarkup(createElement(ReviewCard, {
    item: { ...BANK_ITEMS[0], receipt },
    account: 'Chase ••4821',
    onAction: () => {},
    onPatch: () => {},
    ...extra,
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

// A receipt add writes before the card moves, so the card has to say it is
// working and refuse a second tap (the 21:44/21:45 duplicates).
test('an in-flight receipt add locks both buttons and says Adding…', () => {
  const html = card(RECEIPT, { busy: true });
  assert.equal(html.includes('Adding…'), true, 'the Add button says what it is doing');
  assert.equal(html.includes('Add to record'), false);
  assert.equal((html.match(/<button[^>]*disabled/g) ?? []).length >= 2, true, 'Add and its pair both lock');
  assert.equal(html.includes('Receipt attached'), true, 'the picked photo is still there while it uploads');
});

test('a refused receipt add shows its reason under the receipt row', () => {
  const message = 'That receipt is already on another expense.';
  const html = card(null, { error: message });
  assert.equal(html.includes(message), true, 'the toast text, inline as well');
  assert.equal(html.includes('role="alert"'), true, 'announced, not just painted');
  assert.equal(card(null).includes(message), false, 'no error, no line');
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
