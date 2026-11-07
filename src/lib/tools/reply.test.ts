import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FALLBACK, NO_LOOKUP_REPLY, replyFor, withoutMoney } from './reply';
import type { UnpaidSummary } from './unpaid';

const summary = { sentence: 'Two invoices are unpaid, $300.00 in all.' } as UnpaidSummary;

test('tool never called: fixed reply, model prose never shown', () => {
  assert.equal(
    replyFor({ modelText: 'Nobody owes you anything, you are all clear.', summary: null, toolCalled: false }),
    NO_LOOKUP_REPLY,
  );
});

test('tool called but the read failed: fallback, no prose guess', () => {
  assert.equal(replyFor({ modelText: 'Probably nobody.', summary: null, toolCalled: true }), FALLBACK);
});

test('tool result: server sentence leads, model money is dropped', () => {
  assert.equal(
    replyFor({ modelText: 'That is $999 total. Want me to remind them?', summary, toolCalled: true }),
    `${summary.sentence} Want me to remind them?`,
  );
});

test('tool result with no usable prose: just the server sentence', () => {
  assert.equal(replyFor({ modelText: 'It is $5 in all.', summary, toolCalled: true }), summary.sentence);
});

test('withoutMoney keeps sentences with no dollar amount', () => {
  assert.equal(withoutMoney('Two are late. They owe $40 total. Ask them?'), 'Two are late. Ask them?');
});

test('the fixed replies carry no "quote" copy and no emoji', () => {
  for (const s of [FALLBACK, NO_LOOKUP_REPLY]) {
    assert.doesNotMatch(s, /quote/i);
    assert.doesNotMatch(s, /\p{Extended_Pictographic}/u);
  }
});
