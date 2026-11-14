// History carries server-composed figures ("Two are unpaid, $120.00 in total"),
// and the model may repeat one because it saw it. The money rule does not move:
// only a figure this turn's tools produced is allowed into model prose, so a
// figure the model repeats from memory is stripped with its sentence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { guardModelMoney } from './money';
import { loadHistory, type HistoryReader } from './history';

const read: HistoryReader = async () => [
  {
    user_text: 'who owes me?',
    reply_text: 'Two are unpaid, $1,200.00 in total.',
    created_at: new Date().toISOString(),
  },
];

test('a figure only history carries is stripped from the model prose', async () => {
  const history = await loadHistory(read, 'chat-1');
  assert.match(JSON.stringify(history), /\$1,200\.00/, 'the server figure is in the context');

  // No tool ran this turn, so nothing backs the figure the model repeats.
  const guarded = guardModelMoney('He still owes $1,200.00.', []);
  assert.equal(guarded.ok, false);
  assert.deepEqual(guarded.offending, [1200]);
  assert.equal(guarded.text.includes('$1,200.00'), false);
  assert.equal(guarded.text, '');
});

test('history is never handed to the guard as a source, only tool results are', async () => {
  // The guard trusts whatever it is given, so the route must give it this turn's
  // tool results and nothing else: history would launder a figure it never read.
  const route = readFileSync('src/app/api/ask/route.ts', 'utf8');
  assert.match(route, /guardModelMoney\(result\.replyText, result\.toolResults\)/);
  assert.equal(
    /guardModelMoney\([^)]*history/.test(route),
    false,
    'history is context, never a money source',
  );
});

test('the same figure is allowed once this turn tool produced it', () => {
  const guarded = guardModelMoney('He still owes $1,200.00.', [
    { totalBalanceText: '$1,200.00' },
  ]);
  assert.equal(guarded.ok, true);
  assert.equal(guarded.text, 'He still owes $1,200.00.');
});
