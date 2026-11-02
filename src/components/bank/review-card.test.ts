// ═══ ReviewCard — the control a real card must not show ═══
// "Attach receipt" was a mock: it flipped item.receipt locally, opened no picker
// and never reached the expense. The real card (no ?bankState= fixture flag) must
// not offer it; the row is kept only behind the fixture flag for the design check.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReviewCard from './ReviewCard';
import { BANK_ITEMS } from '../../lib/bank-tracking';

function card(receipt: boolean): string {
  return renderToStaticMarkup(createElement(ReviewCard, {
    item: { ...BANK_ITEMS[0], receipt },
    account: 'Chase ••4821',
    onAction: () => {},
    onPatch: () => {},
  }));
}

test('the real card offers no receipt control', () => {
  const html = card(false);
  assert.equal(html.includes('Attach receipt'), false, 'the fake button is gone');
  assert.equal(html.includes('Receipt attached'), false);
});

test('a stored receipt flag cannot resurrect the row on the real card', () => {
  const html = card(true);
  assert.equal(html.includes('Receipt attached'), false);
  assert.equal(html.includes('Attach receipt'), false);
});
