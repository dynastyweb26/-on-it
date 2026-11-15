// A turn that offered a confirm card is not a pending instruction to the model,
// and a bare "yes" after it means tap the card. Both facts come from the card
// the turn offered, which chat_messages stores as template_id.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lastTurnOfferedCard, historyMessages, type HistoryRow } from './history';

const NOW = new Date('2026-11-14T10:10:00Z');

const row = (over: Partial<HistoryRow> = {}): HistoryRow => ({
  user_text: 'add Ruth Lawrence as a client, 555-0100',
  reply_text: 'Add client Ruth Lawrence ready to confirm.',
  template_id: 'confirm.batch',
  created_at: '2026-11-14T10:00:00Z',
  ...over,
});

test('the newest earlier turn offered a confirm card', () => {
  assert.equal(lastTurnOfferedCard([row()], NOW), true);
  // A later plain answer is the newest turn, so there is no card to tap.
  assert.equal(
    lastTurnOfferedCard(
      [
        row(),
        row({
          user_text: 'how much did I make?',
          reply_text: 'Money in was +$900.00.',
          template_id: null,
          created_at: '2026-11-14T10:02:00Z',
        }),
      ],
      NOW,
    ),
    false,
  );
});

test('a lookup card is not a card to confirm', () => {
  assert.equal(lastTurnOfferedCard([row({ template_id: 'cant.do' })], NOW), false);
  assert.equal(lastTurnOfferedCard([row({ template_id: null })], NOW), false);
});

test('an old turn outside the conversation window offers nothing', () => {
  assert.equal(lastTurnOfferedCard([row({ created_at: '2026-11-14T08:00:00Z' })], NOW), false);
  assert.equal(lastTurnOfferedCard([], NOW), false);
});

test('a card turn is passed back as an offer, never as a pending instruction', () => {
  const messages = historyMessages([row()], NOW);
  assert.deepEqual(messages, [
    { role: 'user', content: 'add Ruth Lawrence as a client, 555-0100' },
    {
      role: 'assistant',
      content: '(offered a card: Add client Ruth Lawrence ready to confirm.; nothing was saved)',
    },
  ]);
});

test('a plain turn keeps its reply, and so does a lookup card', () => {
  const plain = historyMessages([row({ template_id: null })], NOW);
  assert.equal(plain[1].content, 'Add client Ruth Lawrence ready to confirm.');
  const lookup = historyMessages([
    row({ template_id: 'cant.do', reply_text: "I can't look that up yet." }),
  ], NOW);
  assert.equal(lookup[1].content, "I can't look that up yet.");
});
