import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answerFor } from './answer';
import { REGISTRY } from './registry';
import { FALLBACK, NO_LOOKUP_REPLY } from './reply';
import { TURN_BUDGET_REPLY } from './budget';
import { getClientSummaryTool } from './definitions/get_client_summary';

const clientOutput = getClientSummaryTool.fixture.result as never;
const clientSentence = getClientSummaryTool.fallback(clientOutput);

test('get_client_summary never replies "I can\'t look that up yet."', () => {
  // The bug this covers: the reply was only composed from the unpaid summary,
  // so every other tool's turn fell through to the no-lookup line.
  const answer = answerFor({
    modelText: 'Ruth has paid some of it.',
    toolRuns: [{ name: 'get_client_summary', status: 'ok', output: clientOutput }],
    registry: REGISTRY,
  });
  assert.notEqual(answer.reply, NO_LOOKUP_REPLY);
  assert.ok(answer.reply.startsWith(clientSentence));
  assert.equal(answer.sentence, clientSentence);
  assert.equal(answer.card?.id, 'stat.tiles');
});

test('every tool leads with its own server sentence', () => {
  for (const tool of REGISTRY.list) {
    const own = tool.fallback(tool.fixture.result as never);
    const answer = answerFor({
      modelText: 'Here is what I found.',
      toolRuns: [{ name: tool.name, status: 'ok', output: tool.fixture.result }],
      registry: REGISTRY,
    });
    assert.notEqual(answer.reply, NO_LOOKUP_REPLY, tool.name);
    assert.ok(answer.reply.startsWith(own), tool.name);
    assert.equal(answer.sentence, own, tool.name);
  }
});

test('no tool ran: the fixed line and the cant.do card', () => {
  const answer = answerFor({
    modelText: 'You spent about a thousand on gas.',
    toolRuns: [],
    registry: REGISTRY,
  });
  assert.equal(answer.reply, NO_LOOKUP_REPLY);
  assert.equal(answer.sentence, null);
  assert.equal(answer.card?.id, 'cant.do');
  assert.equal(answer.tool, null);
});

test('a tool that ran but failed guesses nothing and draws no card', () => {
  const answer = answerFor({
    modelText: 'Probably nobody.',
    toolRuns: [{ name: 'get_client_summary', status: 'error' }],
    registry: REGISTRY,
  });
  assert.equal(answer.reply, FALLBACK);
  assert.equal(answer.card, null);
});

test('a spent budget still uses the tool sentence when one was composed', () => {
  const answer = answerFor({
    modelText: TURN_BUDGET_REPLY,
    toolRuns: [{ name: 'get_client_summary', status: 'ok', output: clientOutput }],
    registry: REGISTRY,
    budgetExhausted: true,
  });
  assert.equal(answer.reply, clientSentence);

  const none = answerFor({
    modelText: TURN_BUDGET_REPLY,
    toolRuns: [],
    registry: REGISTRY,
    budgetExhausted: true,
  });
  assert.equal(none.reply, TURN_BUDGET_REPLY);
});

test('a proposal leads with its server sentence and one confirm row', () => {
  const row = { icon: 'person', summary: 'Add client Maria Santos', amount: '', tone: 'neutral' as const };
  const answer = answerFor({
    modelText: 'Done, Maria is on the list.',
    toolRuns: [{ name: 'create_client', status: 'pending' }],
    registry: REGISTRY,
    pending: [{
      tool: 'create_client',
      actionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      token: 'token',
      expiresAt: '2026-01-01T00:00:00Z',
      row,
      sentence: 'Ready to confirm: Add client Maria Santos.',
    }],
  });
  assert.equal(answer.sentence, 'Ready to confirm: Add client Maria Santos.');
  assert.ok(answer.reply.startsWith('Ready to confirm: Add client Maria Santos.'));
  assert.equal(answer.card?.id, 'confirm.batch');
  const actions = (answer.card?.props as { actions: Array<{ summary: string; status: string }> }).actions;
  assert.deepEqual(actions.map((action) => [action.summary, action.status]), [['Add client Maria Santos', 'pending']]);
});

test('a proposal the model claimed as done still reads as ready, never saved', () => {
  const answer = answerFor({
    modelText: 'Saved Maria Santos for you.',
    toolRuns: [{ name: 'create_client', status: 'pending' }],
    registry: REGISTRY,
    pending: [{
      tool: 'create_client',
      actionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      token: 'token',
      expiresAt: '2026-01-01T00:00:00Z',
      row: { icon: 'person', summary: 'Add client Maria Santos', amount: '', tone: 'neutral' },
      sentence: 'Ready to confirm: Add client Maria Santos.',
    }],
  });
  assert.equal(/saved/i.test(answer.reply), false);
});

test('a prepare problem is its own sentence and draws no card', () => {
  const problem = 'You already have a client named Maria Santos.';
  const answer = answerFor({
    modelText: 'Added her.',
    toolRuns: [{ name: 'create_client', status: 'problem', output: { problem } }],
    registry: REGISTRY,
  });
  assert.equal(answer.reply, problem);
  assert.equal(answer.sentence, problem);
  assert.equal(answer.card, null);
  assert.equal(answer.tool?.name, 'create_client');
});

test('a proposal made with the budget spent still says ready to confirm', () => {
  const answer = answerFor({
    modelText: TURN_BUDGET_REPLY,
    toolRuns: [{ name: 'create_client', status: 'pending' }],
    registry: REGISTRY,
    budgetExhausted: true,
    pending: [{
      tool: 'create_client',
      actionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      token: 'token',
      expiresAt: '2026-01-01T00:00:00Z',
      row: { icon: 'person', summary: 'Add client Maria Santos', amount: '', tone: 'neutral' },
      sentence: 'Ready to confirm: Add client Maria Santos.',
    }],
  });
  assert.equal(answer.reply, 'Ready to confirm: Add client Maria Santos.');
  assert.equal(answer.card?.id, 'confirm.batch');
});
