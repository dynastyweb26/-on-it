// ═══ The card never clips its buttons ═══
// The reported bug: on a phone the deposit card grew past the sheet and its
// Save / Don't add buttons were cut off, with the page dots sitting on top of
// them. The contract that prevents it is structural — an outer full-height
// column, a body that is min-h-0 + flex-1 + overflow-y-auto + overscroll-contain,
// and the buttons in a shrink-0 bar OUTSIDE that body — so this test reads the
// rendered DOM and the height budget at both viewports.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import DepositCard from './DepositCard';
import ReviewCard from './ReviewCard';
import { BANK_ITEMS } from '../../lib/bank-tracking';
import { stackBudget, type StackCardShape } from '../../lib/stack-fit';
import type { ApiDeposit } from '../../lib/bank-deposits';

const DEPOSIT: ApiDeposit = {
  id: 'd1',
  name: 'STRIPE TRANSFER',
  merchant: null,
  amount_cents: 40000,
  occurred_on: '2026-10-29',
  pending: false,
  removed: false,
  is_stripe_payout: false,
  payout: 'not_stripe',
  account: 'Chase ••4821',
  accounted: false,
  link: null,
  suggestion: null,
};

const depositCard = () => renderToStaticMarkup(createElement(DepositCard, {
  deposit: DEPOSIT,
  invoices: [],
  payments: [{ id: 'p1', invoice_number: 42, amount_cents: 40000, method: 'check', paid_at: '2026-10-29' }],
  onResolved: () => {},
}));

const expenseCard = () => renderToStaticMarkup(createElement(ReviewCard, {
  item: { ...BANK_ITEMS[0], receipt: null },
  account: 'Chase ••4821',
  onAction: () => {},
  onPatch: () => {},
}));

test('the card body scrolls and the buttons sit outside it, pinned', () => {
  for (const [name, html] of [['deposit', depositCard()], ['expense', expenseCard()]] as const) {
    assert.equal(html.includes('overscroll-contain'), true, `${name}: the body must contain its scroll`);
    assert.equal(/flex min-h-0 flex-auto flex-col gap-3\.5 overflow-y-auto/.test(html), true,
      `${name}: the body is the only part allowed to shrink`);
    const bar = html.indexOf('shrink-0 flex-col gap-2 p-[18px] pt-3');
    assert.ok(bar > 0, `${name}: the button bar is its own pinned row`);
    assert.ok(html.indexOf('overflow-y-auto') < bar, `${name}: the buttons are not inside the scroller`);
    assert.equal(html.indexOf('min-h-[54px]', bar) > bar, true, `${name}: the primary button is in that bar`);
  }
});

test('at 390x700 and 1280x700 the buttons stay inside the dialog', () => {
  const shapes: StackCardShape[] = ['expense', 'deposit-existing', 'deposit-chips'];
  for (const [width, height] of [[390, 700], [1280, 700]] as const) {
    for (const shape of shapes) {
      const budget = stackBudget(width, height, shape);
      assert.equal(budget.buttonsInside, true,
        `${shape} at ${width}x${height}: body ${budget.body}px must leave room for the buttons`);
      assert.equal(budget.scrolls, true,
        `${shape} at ${width}x${height}: the tall body scrolls rather than pushing the buttons out`);
    }
  }
});
