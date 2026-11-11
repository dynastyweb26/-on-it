// Money in tool output is a typed, server-composed pair, and model prose may
// only repeat figures the server actually holds. Both halves are tested here so
// the routes can rely on them without re-deriving either.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dollarFigures, guardModelMoney, moneyField, moneyFigures } from './money';

test('a money field carries the number and the server-formatted text', () => {
  assert.deepEqual(moneyField(1234.5), { amount: 1234.5, text: '$1,234.50' });
  assert.deepEqual(moneyField(-0.005), { amount: 0, text: '$0.00' });
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
