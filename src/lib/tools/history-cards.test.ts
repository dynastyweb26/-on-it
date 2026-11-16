// A turn that offered a confirm card is not a pending instruction to the model,
// and a bare "yes" after it means tap the card. Both facts come from the card
// the turn offered, which chat_messages stores as template_id.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasLivePendingAction,
  historyMessages,
  lastTurnOfferedCard,
  type HistoryRow,
  type PendingRow,
} from './history';

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

/** The card sentence prepare() composes: "Ready to confirm: <summary>." */
const cardTurn = (over: Partial<HistoryRow> = {}): HistoryRow => ({
  user_text: 'add Ruth Lawrence as a client, 555-0100',
  reply_text: 'Ready to confirm: Add client Ruth Lawrence.',
  template_id: 'confirm.batch',
  created_at: '2026-11-14T10:00:00Z',
  ...over,
});

const action = (over: Partial<PendingRow> = {}): PendingRow => ({
  tool: 'create_client',
  created_at: '2026-11-14T10:00:00Z',
  expires_at: '2026-11-14T10:15:00Z',
  executed_at: null,
  ...over,
});

test('a confirmed card turn is passed back as what was saved', () => {
  const messages = historyMessages([cardTurn()], NOW, [
    action({ executed_at: '2026-11-14T10:00:20Z' }),
  ]);
  assert.deepEqual(messages[1], {
    role: 'assistant',
    content: '(confirmed: Add client Ruth Lawrence)',
  });
});

test('a card whose action is still pending is an offer, and there is a card to tap', () => {
  const pending = [action()];
  assert.equal(hasLivePendingAction(pending, NOW), true);
  const messages = historyMessages([cardTurn()], NOW, pending);
  assert.equal(
    messages[1].content,
    '(offered a card: Ready to confirm: Add client Ruth Lawrence.; nothing was saved)',
  );
});

test('an expired action is not live and never reads as confirmed', () => {
  const expired = [action({ expires_at: '2026-11-14T10:09:00Z' })];
  assert.equal(hasLivePendingAction(expired, NOW), false);
  const messages = historyMessages([cardTurn()], NOW, expired);
  assert.equal(
    messages[1].content,
    '(offered a card: Ready to confirm: Add client Ruth Lawrence.; nothing was saved)',
  );
});

test('no action at all is an offer, never a confirmation', () => {
  assert.equal(hasLivePendingAction([], NOW), false);
  assert.equal(
    historyMessages([cardTurn()], NOW, [])[1].content,
    '(offered a card: Ready to confirm: Add client Ruth Lawrence.; nothing was saved)',
  );
  // Two minutes apart is another turn's action, not this one's.
  assert.equal(
    historyMessages([cardTurn()], NOW, [
      action({ created_at: '2026-11-14T09:58:00Z', executed_at: '2026-11-14T09:58:01Z' }),
    ])[1].content,
    '(offered a card: Ready to confirm: Add client Ruth Lawrence.; nothing was saved)',
  );
});

test('an executed action is live only while it is unexecuted and unexpired', () => {
  assert.equal(hasLivePendingAction([action({ executed_at: '2026-11-14T10:00:20Z' })], NOW), false);
  assert.equal(hasLivePendingAction([action({ created_at: '2026-11-14T09:30:00Z' })], NOW), false);
});

test('a plain turn keeps its reply, and so does a lookup card', () => {
  const plain = historyMessages([row({ template_id: null })], NOW);
  assert.equal(plain[1].content, 'Add client Ruth Lawrence ready to confirm.');
  const lookup = historyMessages([
    row({ template_id: 'cant.do', reply_text: "I can't look that up yet." }),
  ], NOW);
  assert.equal(lookup[1].content, "I can't look that up yet.");
});
