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
