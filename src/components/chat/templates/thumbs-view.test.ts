import test from 'node:test';
import assert from 'node:assert/strict';
import { thumbReplyFor, type ThumbMsg } from './thumbs-view';
import { thumbDecision } from '@/lib/templates/thumbs';

const ID = '11111111-1111-4111-8111-111111111111';
const live = { isLatestAssistantReply: true, textDone: true, reopenedPastChatLast: false };
const shows = (m: ThumbMsg, ctx = live) => {
  const r = thumbReplyFor(m, ctx);
  return r ? thumbDecision(r).show : false;
};

test('an answer with a messageId shows thumbs; without one it never does', () => {
  assert.equal(shows({ messageId: ID }), true);
  assert.equal(shows({}), false);
  assert.equal(shows({ template: { id: 'list.ranked' } }), false, 'a card with no messageId has no thumbs');
  assert.equal(shows({ messageId: ID, template: { id: 'list.ranked' } }), true, 'one set per reply, card or not');
});

test('RULES §6 item 2: every never-show case stays hidden', () => {
  assert.equal(shows({ messageId: ID, template: { id: 'cant.do' } }), false, 'cant.do');
  assert.equal(shows({ messageId: ID, signInLink: true }), false, 'signed out');
  assert.equal(shows({ messageId: ID, failed: {} }), false, 'error');
  assert.equal(shows({ messageId: ID, recapCard: {} }), false, 'recap');
  assert.equal(shows({ messageId: ID, ownerCard: {} }), false, 'event');
  assert.equal(shows({ messageId: ID, commandCard: true }), false, 'app-posted card');
});

test('RULES §6 item 1: latest only, after its text is done, never the last message of a reopened chat', () => {
  assert.equal(shows({ messageId: ID }, { ...live, isLatestAssistantReply: false }), false);
  assert.equal(shows({ messageId: ID }, { ...live, textDone: false }), false);
  assert.equal(shows({ messageId: ID }, { ...live, reopenedPastChatLast: true }), false);
});
