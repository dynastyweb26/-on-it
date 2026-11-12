// RULES.md §6, items 1-3. Each line of the rule has a test, including every
// reply kind the thumbs must never appear on.
import test from 'node:test';
import assert from 'node:assert/strict';
import { afterVote, finalVote, thumbDecision, type ThumbReplyState } from './thumbs';

const reply = (over: Partial<ThumbReplyState> = {}): ThumbReplyState => ({
  kind: 'answer',
  isLatestAssistantReply: true,
  textDone: true,
  reopenedPastChatLast: false,
  ...over,
});

test('the latest, finished assistant reply shows one set of thumbs', () => {
  const d = thumbDecision(reply());
  assert.deepEqual(d, { show: true, vote: null, followUpOpen: false });
});

test('a reply that includes a card still shows exactly one set', () => {
  const withCard = thumbDecision(reply());
  assert.equal(withCard.show, true);
  assert.equal(Object.keys(withCard).includes('vote'), true);
});

test('only the latest reply shows thumbs; a new reply removes the old set', () => {
  const previous = thumbDecision(reply({ isLatestAssistantReply: false }));
  assert.deepEqual(previous, { show: false, reason: 'not_latest' });
  assert.equal(thumbDecision(reply()).show, true);
});

test('no thumbs while the text is still appearing', () => {
  assert.deepEqual(thumbDecision(reply({ textDone: false })), {
    show: false,
    reason: 'text_unfinished',
  });
});

test('a confirm card waiting for an answer never shows thumbs', () => {
  assert.deepEqual(thumbDecision(reply({ kind: 'confirm_pending' })), {
    show: false,
    reason: 'confirm_pending',
  });
});

test('event and recap cards the app posts never show thumbs', () => {
  assert.deepEqual(thumbDecision(reply({ kind: 'event' })), { show: false, reason: 'event' });
  assert.deepEqual(thumbDecision(reply({ kind: 'recap' })), { show: false, reason: 'recap' });
});

test('the signed-out reply never shows thumbs', () => {
  assert.deepEqual(thumbDecision(reply({ kind: 'signed_out' })), {
    show: false,
    reason: 'signed_out',
  });
});

test('an error reply never shows thumbs', () => {
  assert.deepEqual(thumbDecision(reply({ kind: 'error' })), { show: false, reason: 'error' });
});

test('a cant.do reply never shows thumbs', () => {
  assert.deepEqual(thumbDecision(reply({ kind: 'cant_do' })), { show: false, reason: 'cant_do' });
});

test('the last message of a reopened past chat never shows thumbs', () => {
  assert.deepEqual(thumbDecision(reply({ reopenedPastChatLast: true })), {
    show: false,
    reason: 'reopened_past_chat',
  });
});

test('a stored down vote reopens its follow-up; up does not', () => {
  assert.deepEqual(thumbDecision(reply({ vote: 'down', followUpOpen: true })), {
    show: true,
    vote: 'down',
    followUpOpen: true,
  });
  assert.deepEqual(thumbDecision(reply({ vote: 'up' })), {
    show: true,
    vote: 'up',
    followUpOpen: false,
  });
});

test('the final vote is the last one recorded, including a clear', () => {
  assert.equal(finalVote([]), null);
  assert.equal(finalVote(['down', 'up']), 'up');
  assert.equal(finalVote(['up', 'down']), 'down');
  assert.equal(finalVote(['down', null]), null);
});

test('tapping the same thumb clears it, the other switches and opens the follow-up', () => {
  assert.deepEqual(afterVote(null, 'up'), { vote: 'up', followUpOpen: false });
  assert.deepEqual(afterVote('up', 'down'), { vote: 'down', followUpOpen: true });
  assert.deepEqual(afterVote('down', 'down'), { vote: null, followUpOpen: false });
  assert.deepEqual(afterVote('down', 'up'), { vote: 'up', followUpOpen: false });
});
