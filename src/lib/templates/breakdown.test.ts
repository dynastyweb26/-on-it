// RULES.md §2: top 6 plus Other, Other last, whole shares summing to 100.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BREAKDOWN_TOP, breakdownView, sharesSummingTo100 } from './breakdown';
import { BREAKDOWN_FIXTURE } from './fixtures';
import { parseTemplateProps } from './props';

const row = (name: string, value: number, amount = `$${value.toFixed(2)}`) => ({ name, value, amount });

test('ten rows become the top six plus Other, with Other last', () => {
  const view = breakdownView({
    eyebrow: 'Spent by category · October',
    tone: 'out',
    total: '$10,000.00',
    otherAmount: '$900.00',
    rows: [
      row('A', 3000),
      row('B', 2000),
      row('C', 1500),
      row('D', 1000),
      row('E', 700),
      row('F', 500),
      row('G', 400),
      row('H', 300),
      row('I', 200),
      row('J', 100),
    ],
  });

  assert.equal(BREAKDOWN_TOP, 6);
  assert.deepEqual(view.props.rows.map((r) => r.name), ['A', 'B', 'C', 'D', 'E', 'F', 'Other']);
  assert.equal(view.props.rows.at(-1)?.other, true);
  assert.equal(view.props.rows.at(-1)?.amount, '$900.00');
  assert.equal(view.hasOther, true);
});

test('the shares are whole numbers that sum to 100', () => {
  const view = breakdownView({
    eyebrow: 'Spent by category · October',
    tone: 'out',
    total: '$5,200.80',
    rows: BREAKDOWN_FIXTURE.rows.map((r, i) => ({
      name: r.name,
      amount: r.amount,
      value: [2140, 860.4, 720, 650, 310.25, 280, 240.15][i],
      other: r.other,
    })),
  });
  const shares = view.props.rows.map((r) => r.share);
  assert.equal(shares.reduce((a, b) => a + b, 0), 100);
  assert.ok(shares.every((s) => Number.isInteger(s)));
  assert.equal(view.props.rows.at(-1)?.name, 'Other');
  assert.equal(view.props.rows.at(-1)?.share, 5);
  const parsed = parseTemplateProps('chart.breakdown', view.props);
  assert.equal(parsed.success, true);
});

test('largest remainder splits three equal parts without losing a point', () => {
  assert.deepEqual(sharesSummingTo100([1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(sharesSummingTo100([1, 2]), [33, 67]);
  assert.deepEqual(sharesSummingTo100([0, 0]), [0, 0]);
});

test('a list of six or fewer has no Other bucket', () => {
  const view = breakdownView({
    eyebrow: 'Spent by category',
    tone: 'out',
    total: '$600.00',
    rows: [row('A', 400), row('B', 200)],
  });
  assert.equal(view.hasOther, false);
  assert.deepEqual(view.props.rows.map((r) => r.name), ['A', 'B']);
  assert.equal(view.props.rows.reduce((a, r) => a + r.share, 0), 100);
});

test('a supplied Other row absorbs the rows beyond the top six and stays last', () => {
  const view = breakdownView({
    eyebrow: 'Spent by category',
    tone: 'out',
    total: '$1,000.00',
    rows: [
      row('A', 400),
      row('B', 300),
      row('C', 100),
      row('D', 50),
      row('E', 40),
      row('F', 30),
      row('G', 20),
      { ...row('Other', 60, '$60.00'), other: true },
    ],
  });
  const rows = view.props.rows;
  assert.equal(rows.length, 7);
  assert.deepEqual(rows.map((r) => r.name), ['A', 'B', 'C', 'D', 'E', 'F', 'Other']);
  assert.equal(rows.at(-1)?.amount, '$60.00', 'the server string wins, not a recomputed one');
  assert.equal(rows.reduce((a, r) => a + r.share, 0), 100);
});

test('folding rows without a finished Other amount is refused', () => {
  assert.throws(
    () =>
      breakdownView({
        eyebrow: 'Spent by category',
        tone: 'out',
        total: '$100.00',
        rows: Array.from({ length: 7 }, (_, i) => row(`R${i}`, 10)),
      }),
    /finished Other amount/,
  );
});

test('no rows is the empty state', () => {
  const view = breakdownView({ eyebrow: 'Spent by category', tone: 'out', total: '$0.00', rows: [] });
  assert.equal(view.props.state, 'empty');
  assert.deepEqual(view.props.rows, []);
});
