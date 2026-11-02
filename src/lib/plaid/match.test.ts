// ═══ Matching a bank row to an expense, and the money primitives ═══
// The row says 432.98 on Oct 27; the expense says 432.98 on Oct 28. Cents make
// the equality exact, and the vendor decides "strong" vs merely the same amount.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_EXPENSE_CENTS, MATCH_DAY_WINDOW, centsToAmount, daysBetween, expenseCategoryFromPlaid,
  normalizeVendor, parseCents, shiftIsoDay, suggestMatch, vendorsMatch,
  type MatchExpense,
} from './match';

test('money is parsed to exact cents, never a float', () => {
  assert.equal(parseCents('432.98'), 43298);
  assert.equal(parseCents('0.10'), 10);
  assert.equal(parseCents('7'), 700);
  assert.equal(parseCents(30.38), 3038);
  assert.equal(parseCents(0.1 + 0.2), 30, 'the classic 0.30000000000000004');
  assert.equal(parseCents(' 12.3 '), 1230);
  assert.equal(parseCents('1.234'), null);
  assert.equal(parseCents(''), null);
  assert.equal(parseCents(null), null);
  assert.equal(parseCents(Number.NaN), null);
  assert.equal(centsToAmount(43298), '432.98');
  assert.equal(centsToAmount(5), '0.05');
  assert.equal(centsToAmount(1000000), '10000.00');
  assert.equal(MAX_EXPENSE_CENTS, 10_000_000);
});

test('dates compare in whole days, with no clock or timezone', () => {
  assert.equal(daysBetween('2026-10-27', '2026-10-30'), 3);
  assert.equal(daysBetween('2026-10-30', '2026-10-27'), 3);
  assert.equal(daysBetween('2026-10-27', '2026-10-27'), 0);
  assert.equal(daysBetween('2026-10-31', '2026-11-02'), 2);
  assert.equal(daysBetween('2026-10-27', 'nope'), null);
  assert.equal(shiftIsoDay('2026-10-01', -1), '2026-09-30');
  assert.equal(shiftIsoDay('2026-10-31', 1), '2026-11-01');
  assert.equal(MATCH_DAY_WINDOW, 3);
});

test('the same merchant survives the bank’s spelling', () => {
  assert.equal(normalizeVendor('Costco Wholesale #123'), 'costco wholesale 123');
  assert.equal(normalizeVendor('THE HOME DEPOT, INC.'), 'home depot');
  assert.equal(vendorsMatch('Costco Wholesale', 'COSTCO WHOLESALE #123'), true);
  assert.equal(vendorsMatch("Lowe's", 'Lowes Home Improvement'), true);
  assert.equal(vendorsMatch('Shell', 'Shell Oil 04921'), true);
  assert.equal(vendorsMatch('Costco', 'Home Depot'), false);
  assert.equal(vendorsMatch('', 'Costco'), false);
});

const ROW = {
  amount_cents: 43298,
  occurred_on: '2026-10-27',
  merchant: 'Costco Wholesale',
  description: 'COSTCO WHOLESALE #123',
};

const expense = (over: Partial<MatchExpense> = {}): MatchExpense => ({
  id: 'e1',
  vendor: 'Costco Wholesale',
  description: 'Supplies',
  amount: '432.98',
  spent_on: '2026-10-28',
  category: 'supplies',
  ...over,
});

test('a match needs the same cents and a date within ±3 days', () => {
  const strong = suggestMatch(ROW, [expense()], new Set());
  assert.ok(strong);
  assert.equal(strong.expense_id, 'e1');
  assert.equal(strong.amount_cents, 43298);
  assert.equal(strong.date, '2026-10-28');
  assert.equal(strong.strong, true);

  assert.equal(suggestMatch({ ...ROW, amount_cents: 43299 }, [expense()], new Set()), null, 'one cent off');
  assert.equal(suggestMatch(ROW, [expense({ spent_on: '2026-10-30' })], new Set())?.expense_id, 'e1', 'day 3');
  assert.equal(suggestMatch(ROW, [expense({ spent_on: '2026-10-31' })], new Set()), null, 'day 4');
});

test('an expense already behind another bank row is never suggested', () => {
  assert.equal(suggestMatch(ROW, [expense()], new Set(['e1'])), null);
  assert.equal(suggestMatch(ROW, [expense(), expense({ id: 'e2', spent_on: '2026-10-27' })], new Set(['e1']))?.expense_id, 'e2');
});

test('a merchant match beats a nearer date; ties go to the nearest then the id', () => {
  const farStrong = expense({ id: 'strong', spent_on: '2026-10-24' });
  const nearWeak = expense({ id: 'near', vendor: 'Some Other Store', spent_on: '2026-10-27' });
  assert.equal(suggestMatch(ROW, [nearWeak, farStrong], new Set())?.expense_id, 'strong');
  assert.equal(suggestMatch(ROW, [nearWeak], new Set())?.strong, false);

  const same = expense({ id: 'b' });
  const other = expense({ id: 'a' });
  assert.equal(suggestMatch(ROW, [same, other], new Set())?.expense_id, 'a', 'deterministic tie-break');
});

test('a merchant typed as a number is still compared as text', () => {
  const match = suggestMatch(
    { ...ROW, amount_cents: 9712, merchant: null, description: 'SQ *BLUE BOTTLE' },
    [expense({ id: 'e9', vendor: 'Blue Bottle', amount: 97.12, spent_on: '2026-10-28' })],
    new Set(),
  );
  assert.equal(match?.expense_id, 'e9');
  assert.equal(match?.strong, true);
});

test('Plaid categories map onto the categories the database accepts', () => {
  assert.equal(expenseCategoryFromPlaid('FOOD_AND_DRINK'), 'food');
  assert.equal(expenseCategoryFromPlaid(null, 'SHELL OIL 04921'), 'fuel');
  assert.equal(expenseCategoryFromPlaid('GENERAL_MERCHANDISE'), 'supplies');
  assert.equal(expenseCategoryFromPlaid('TRAVEL'), 'travel');
  assert.equal(expenseCategoryFromPlaid('TELECOM'), 'phone');
  assert.equal(expenseCategoryFromPlaid('INSURANCE'), 'insurance');
  assert.equal(expenseCategoryFromPlaid('SOMETHING_NEW'), 'other');
  assert.equal(expenseCategoryFromPlaid(null), 'other');
});
