// ═══ The card never clips its buttons ═══
// The reported bug: on a phone the deposit card grew past the sheet and its
// Save / Don't add buttons were cut off, with the page dots sitting on top of
// them. The contract that prevents it is structural — an outer full-height
// column, a body that is min-h-0 + flex-1 + overflow-y-auto + overscroll-contain,
// and the buttons in a shrink-0 bar OUTSIDE that body — so this test reads the
// rendered DOM and the height budget at both viewports.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import DepositCard from './DepositCard';
import ReviewCard from './ReviewCard';
import { BANK_ITEMS } from '../../lib/bank-tracking';
import { STACK_CARD_SLOT, stackBudget, type StackCardShape } from '../../lib/stack-fit';
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

// The sheet's own two contracts — a definite height and a card slot that fills
// the zone — live in ReviewStack's markup, and ReviewStack renders through a
// portal, which the static renderer refuses. So these read its source. They are
// the regression the earlier version of this file missed: every class inside the
// card was right, while the front card was `relative` (auto height) and the
// dialog was max-height only, so the body never had a height to scroll in and
// the phone clipped the buttons.
const stackSource = readFileSync(join(process.cwd(), 'src/components/bank/ReviewStack.tsx'), 'utf8');

test('the front card fills the card zone like the peeks do', () => {
  assert.equal(STACK_CARD_SLOT, 'absolute inset-0');
  assert.ok(stackSource.includes('className={STACK_CARD_SLOT}'),
    'every depth uses STACK_CARD_SLOT: the front card must fill the zone, not size to its content');
  assert.equal(stackSource.includes("isTop ? 'relative' : 'absolute inset-0'"), false,
    'a relative front card is auto-height, so its h-full body cannot resolve and the buttons fall outside the clip');
});

test('the sheet has a fixed height on phones and on desktop', () => {
  assert.ok(stackSource.includes('h-[calc(100%-12px)]'),
    'the phone dialog is a definite height, so the card zone has a height to give the body');
  assert.equal(/max-h-\[calc\(100%-12px\)\]/.test(stackSource), false,
    'max-height leaves the sheet content-sized: the card zone then has no height and the body cannot scroll');
  assert.ok(stackSource.includes('md:h-[calc(100dvh-32px)]'),
    'the desktop dialog is a definite height too');
});

test('at 390x700 and 1280x700 the buttons stay inside the dialog', () => {
  const shapes: StackCardShape[] = ['expense', 'deposit-existing', 'deposit-chips'];
  for (const [width, height] of [[390, 700], [1280, 700]] as const) {
    for (const shape of shapes) {
      const budget = stackBudget(width, height, shape);
      assert.equal(budget.buttonsInside, true,
        `${shape} at ${width}x${height}: body ${budget.body}px must leave room for the buttons`);
      if (shape === 'expense') {
        assert.equal(budget.scrolls, false,
          `${shape} at ${width}x${height}: a short body fits without scrolling`);
      } else {
        assert.equal(budget.scrolls, true,
          `${shape} at ${width}x${height}: the tall body scrolls rather than pushing the buttons out`);
      }
    }
  }
});
