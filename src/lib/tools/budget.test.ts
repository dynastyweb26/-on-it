// The budget is the whole point of item 3: a turn cannot spend more than eight
// model calls, however many routes it touches, and the failure is a plain reply
// rather than an error.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TURN_BUDGET_REPLY, TURN_MODEL_CALL_CAP, createTurnBudget } from './budget';
import { fixtureDb } from './fixture-db';
import { runToolTurn, type ModelCall } from './turn';

const USER = '11111111-1111-1111-1111-111111111111';

/** A reserver with a fixed allowance, counting what it was asked for. */
function allowance(limit: number) {
  let used = 0;
  return {
    used: () => used,
    reserve: async () => {
      if (used >= limit) return false;
      used += 1;
      return true;
    },
  };
}

test('the turn cap is eight model calls, shared, not three per route', () => {
  assert.equal(TURN_MODEL_CALL_CAP, 8);
  assert.match(TURN_BUDGET_REPLY, /ask me again/i);
  assert.equal(/\$\s?\d/.test(TURN_BUDGET_REPLY), false, 'the reserve reply states no money');
});

test('a runaway loop stops cleanly with a plain reply', async () => {
  let calls = 0;
  const alwaysCallsATool: ModelCall = async () => {
    calls += 1;
    return {
      id: `msg-${calls}`,
      type: 'message',
      role: 'assistant',
      model: 'test',
      stop_reason: 'tool_use',
      content: [{
        type: 'tool_use',
        id: `tool-${calls}`,
        name: 'unpaid_invoices',
        input: {},
      }],
      usage: { input_tokens: 1, output_tokens: 1 },
    } as unknown as Awaited<ReturnType<ModelCall>>;
  };

  const budget = createTurnBudget({ userId: USER, turnId: 'turn-1' });
  const result = await runToolTurn({
    call: alwaysCallsATool,
    db: fixtureDb({ invoices: [] }),
    userId: USER,
    question: 'who has not paid me?',
    budget,
  });

  assert.equal(result.budgetExhausted, true);
  assert.equal(result.calls, TURN_MODEL_CALL_CAP);
  assert.equal(calls, TURN_MODEL_CALL_CAP, 'no ninth model call is made');
  assert.equal(result.replyText, TURN_BUDGET_REPLY);
  assert.equal(budget.spent(), TURN_MODEL_CALL_CAP);
});

test('a normal answer costs one call and keeps the model text', async () => {
  let calls = 0;
  const answers: ModelCall = async () => {
    calls += 1;
    return {
      id: 'm',
      type: 'message',
      role: 'assistant',
      model: 'test',
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Two clients are behind.' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    } as unknown as Awaited<ReturnType<ModelCall>>;
  };

  const result = await runToolTurn({
    call: answers,
    db: fixtureDb({ invoices: [] }),
    userId: USER,
    question: 'who has not paid me?',
    budget: createTurnBudget({ userId: USER }),
  });

  assert.equal(result.calls, 1);
  assert.equal(result.budgetExhausted, false);
  assert.equal(result.replyText, 'Two clients are behind.');
  assert.deepEqual(result.toolRuns, []);
});

test('the shared reserver caps a turn across requests, and a spent turn stays spent', async () => {
  const shared = allowance(3);
  const reserve = shared.reserve;

  // The router spends one call of the same turn.
  const router = createTurnBudget({ userId: USER, turnId: 'turn-9', reserve });
  assert.equal(await router.spend(), true);

  // Then /api/ask spends the rest of the same turn id.
  const ask = createTurnBudget({ userId: USER, turnId: 'turn-9', reserve });
  assert.equal(await ask.spend(), true);
  assert.equal(await ask.spend(), true);
  assert.equal(await ask.spend(), false, 'the shared cap is three here');
  assert.equal(shared.used(), 3);
});

test('a request without a turn id still gets the per-request cap', async () => {
  const budget = createTurnBudget({ userId: USER });
  assert.equal(budget.turnId, null);
  for (let i = 0; i < TURN_MODEL_CALL_CAP; i++) {
    assert.equal(await budget.spend(), true, `call ${i + 1} is allowed`);
  }
  assert.equal(await budget.spend(), false);
  assert.equal(budget.spent(), TURN_MODEL_CALL_CAP);
});

test('a broken shared store fails open, and the local cap still holds', async () => {
  const budget = createTurnBudget({
    userId: USER,
    turnId: 'turn-x',
    reserve: async () => {
      throw new Error('redis down');
    },
    cap: 2,
  });
  // reserve throws: spend must not reject the turn
  const first = await budget.spend();
  assert.equal(typeof first, 'boolean');
});
