import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CANT_DO_ALTERNATIVES, FALLBACK, NO_LOOKUP_REPLY, cantDoCard, replyFor, withoutMoney } from './reply';
import { parseTemplateProps } from '@/lib/templates/props';

const sentence = 'Two invoices are unpaid, $300.00 in all.';

test('tool never called: fixed reply, model prose never shown', () => {
  assert.equal(
    replyFor({
      modelText: 'Nobody owes you anything, you are all clear.',
      sentence: null,
      toolCalled: false,
    }),
    NO_LOOKUP_REPLY,
  );
});

test('tool called but the read failed: fallback, no prose guess', () => {
  assert.equal(replyFor({ modelText: 'Probably nobody.', sentence: null, toolCalled: true }), FALLBACK);
});

test('tool result: server sentence leads, model money is dropped', () => {
  assert.equal(
    replyFor({
      modelText: 'That is $999 total. Want me to remind them?',
      sentence,
      toolCalled: true,
    }),
    `${sentence} Want me to remind them?`,
  );
});

test('tool result with no usable prose: just the server sentence', () => {
  assert.equal(replyFor({ modelText: 'It is $5 in all.', sentence, toolCalled: true }), sentence);
});

test('nothing outstanding: one sentence, model prose never appended', () => {
  const empty = 'Nothing is outstanding: every invoice you have sent is paid.';
  assert.equal(
    replyFor({
      modelText: "You're all caught up. No unpaid invoices right now.",
      sentence: empty,
      toolCalled: true,
      sentenceIsWholeAnswer: true,
    }),
    empty,
  );
});

test('any other tool result: its sentence leads even when the model said nothing', () => {
  const client = 'Ruth Lawrence owes $20.00 across 1 open document.';
  assert.equal(
    replyFor({ modelText: 'She has paid most of it.', sentence: client, toolCalled: true }),
    `${client} She has paid most of it.`,
  );
});

test('withoutMoney keeps sentences with no dollar amount', () => {
  assert.equal(withoutMoney('Two are late. They owe $40 total. Ask them?'), 'Two are late. Ask them?');
});

test('an out-of-scope question gets the cant.do card, composed from the same copy', () => {
  const card = cantDoCard();
  assert.equal(card?.id, 'cant.do');
  const props = card?.props as { line: string; alternatives: string[]; noAlts: boolean };
  assert.equal(props.line, NO_LOOKUP_REPLY);
  assert.equal(props.noAlts, false);
  assert.deepEqual(props.alternatives, [...CANT_DO_ALTERNATIVES]);
  // The card the route sends must survive its own props schema.
  assert.equal(parseTemplateProps('cant.do', card?.props).success, true);
});

test('the fixed replies carry no "quote" copy and no emoji', () => {
  for (const s of [FALLBACK, NO_LOOKUP_REPLY]) {
    assert.doesNotMatch(s, /quote/i);
    assert.doesNotMatch(s, /\p{Extended_Pictographic}/u);
  }
});
