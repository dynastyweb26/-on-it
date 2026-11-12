// Money in tool output is a typed, server-composed pair, and model prose may
// only repeat figures the server actually holds. Both halves are tested here so
// the routes can rely on them without re-deriving either.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DRAFT_AMOUNT_TOKEN,
  MONEY_OUT_SIGN,
  dollarFigures,
  fillDraftBody,
  guardDraftBody,
  guardModelMoney,
  moneyField,
  moneyFigures,
  moneyIn,
  moneyOut,
} from './money';

test('a money field carries the number and the server-formatted text', () => {
  assert.deepEqual(moneyField(1234.5), { amount: 1234.5, text: '$1,234.50', tone: 'neutral' });
  assert.deepEqual(moneyField(-0.005), { amount: 0, text: '$0.00', tone: 'neutral' });
});

test('money in and money out are finished strings with the design signs', () => {
  assert.deepEqual(moneyIn(270), { amount: 270, text: '+$270.00', tone: 'in' });
  assert.deepEqual(moneyOut(39.7), { amount: -39.7, text: '−$39.70', tone: 'out' });
  assert.equal(MONEY_OUT_SIGN, '\u2212', 'the minus is U+2212, never a hyphen');
  assert.equal(moneyOut(39.7).text.includes('-'), false);
  assert.equal(moneyOut(-5).text, '−$5.00', 'the sign is never doubled');
  assert.equal(moneyIn(-5).text, '+$5.00');
});

test('a signed amount still grounds the model repeating its figure', () => {
  // Money out stores a negative number; the guard compares magnitudes.
  assert.equal(guardModelMoney('That was −$39.70.', [{ spent: moneyOut(39.7) }]).ok, true);
  assert.equal(guardModelMoney('That was +$270.00.', [{ got: moneyIn(270) }]).ok, true);
  assert.deepEqual(moneyFigures({ spent: moneyOut(39.7) }), [39.7]);
});

test('the server fills a draft body and the guard covers it too', () => {
  const amount = moneyOut(39.7);
  assert.equal(
    fillDraftBody('Order total: {{amount}} today.', amount),
    'Order total: −$39.70 today.',
  );
  // A body with no token is left alone; the server never invents a place for it.
  assert.equal(fillDraftBody('Nothing about money.', amount), 'Nothing about money.');

  // The filled server figure passes...
  const good = guardDraftBody('Your job came to {{amount}}.', amount, []);
  assert.equal(good.ok, true);
  assert.equal(good.text, 'Your job came to −$39.70.');

  // ...and a figure the model wrote that the server does not hold is dropped.
  const bad = guardDraftBody('That job was $500.00 flat. {{amount}} is due.', amount, []);
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.offending, [500]);
  assert.equal(bad.text, '−$39.70 is due.');
});

test('a draft body can carry no amount at all and still guard cleanly', () => {
  const guard = guardDraftBody('See you Tuesday.', moneyField(0), []);
  assert.equal(guard.ok, true);
  assert.equal(guard.text, 'See you Tuesday.');
  assert.equal(DRAFT_AMOUNT_TOKEN, '{{amount}}');
});

test('dollar figures are read in every shape the model writes', () => {
  assert.deepEqual(dollarFigures('Total is $1,200.00 today'), [1200]);
  assert.deepEqual(dollarFigures('$40 and $0.50 and $1,234,567.89'), [40, 0.5, 1234567.89]);
  assert.deepEqual(dollarFigures('no money here, 40 dollars spelled out'), []);
});

test('the allowed set is every money field the server composed, at any depth', () => {
  const result = {
    total: moneyField(480),
    rows: [{ balance: moneyField(120) }, { balance: moneyField(360) }],
    sentence: '2 invoices are still open, $480.00 outstanding.',
    client: 'Maria',
  };
  assert.deepEqual(moneyFigures(result).sort((a, b) => a - b), [120, 360, 480]);
});

test('model text that repeats a server figure passes', () => {
  const guard = guardModelMoney('Two invoices, $480.00 left. Want me to chase them?', [
    { total: moneyField(480) },
  ]);
  assert.equal(guard.ok, true);
  assert.deepEqual(guard.offending, []);
  assert.equal(guard.text, 'Two invoices, $480.00 left. Want me to chase them?');
});

test('a figure with no server source fails the guard and its sentence is dropped', () => {
  const guard = guardModelMoney(
    'You are owed $9,999.00. Two clients still owe you. They are overdue.',
    [{ total: moneyField(480) }],
  );
  assert.equal(guard.ok, false);
  assert.deepEqual(guard.offending, [9999]);
  assert.equal(guard.text, 'Two clients still owe you. They are overdue.');
});

test('the guard never passes a figure the server did not compose, even off by a cent', () => {
  const guard = guardModelMoney('That comes to $480.01.', [{ total: moneyField(480) }]);
  assert.equal(guard.ok, false);
  assert.deepEqual(guard.offending, [480.01]);
  assert.equal(guard.text, '');
});

test('prose without money passes untouched', () => {
  const guard = guardModelMoney('Three clients are overdue. Want the list?', []);
  assert.equal(guard.ok, true);
  assert.equal(guard.text, 'Three clients are overdue. Want the list?');
});
