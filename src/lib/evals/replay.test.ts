// ═══ Replay mode: the model as a file, everything else for real ═══
//
// A recording is only a save of what the model said. Replaying it runs the same
// tool loop, handlers, client resolver, cards and grading the live gate runs, so
// these tests grade real behaviour with zero model calls and zero network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixtureDb } from '../tools/fixture-db';
import { REGISTRY } from '../tools/registry';
import { systemForTurn } from '../tools/turn';
import {
  forbidNetwork,
  recordingHash,
  replayCall,
  replayCase,
  stablePrompt,
  type EvalCase,
} from '../../../scripts/evals/run';

const OWNER = '11111111-1111-1111-1111-111111111111';

const CASE = {
  id: 'invoices-by-client',
  request: 'invoices for Ruth',
  fixture: {
    clients: [{
      id: 'cli-ruth', user_id: OWNER, name: 'Ruth Lawrence', email: 'ruth@example.com',
      phone: null, address: null, created_at: '2026-09-01T00:00:00Z', deleted_at: null,
    }],
    invoices: [{
      id: 'inv-74', user_id: OWNER, kind: 'invoice', invoice_number: 74,
      client_name: 'Ruth Lawrence', status: 'sent', total: 120, amount_paid: 0,
      due_date: '2026-10-08', created_at: '2026-09-01T12:00:00Z', deleted_at: null,
    }],
  },
  expect: {
    tools: ['list_invoices'],
    args: { list_invoices: { client: 'Ruth' } },
    templateId: 'list.ranked',
    writes: 0,
  },
} satisfies EvalCase;

/** What the model said for this case: one tool call, then a short reply. */
const RESPONSES = [
  {
    id: 'm1',
    type: 'message',
    role: 'assistant',
    model: 'recorded',
    stop_reason: 'tool_use',
    content: [{ type: 'tool_use', id: 't1', name: 'list_invoices', input: { client: 'Ruth' } }],
    usage: { input_tokens: 10, output_tokens: 5 },
  },
  {
    id: 'm2',
    type: 'message',
    role: 'assistant',
    model: 'recorded',
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: 'Here is Ruth Lawrence.' }],
    usage: { input_tokens: 20, output_tokens: 6 },
  },
];

/** The hash a recording made right now would carry for this case. */
async function currentHash(testCase: EvalCase, promptSuffix = ''): Promise<string> {
  const system = await systemForTurn(fixtureDb(testCase.fixture), OWNER);
  return recordingHash(`${system}${promptSuffix}`, REGISTRY.modelTools());
}

function withRecording(hash: string, responses: unknown[] = RESPONSES) {
  const dir = mkdtempSync(join(tmpdir(), 'evals-replay-'));
  mkdirSync(join(dir, 'read-tools'), { recursive: true });
  writeFileSync(
    join(dir, 'read-tools', `${CASE.id}.json`),
    JSON.stringify({ version: 1, caseId: CASE.id, hash, responses }),
  );
  return dir;
}

test('a recorded case replays to the same verdict, with no model and no network', async () => {
  const dir = withRecording(await currentHash(CASE));

  const restore = forbidNetwork();
  try {
    // The network is closed for the whole replay: a case that reached out fails.
    await assert.rejects(fetch('https://api.anthropic.com/v1/messages'), /replay tried to reach the network/);
    const outcome = await replayCase({ testCase: CASE, file: 'read-tools', recordingsDir: dir });
    assert.equal(outcome.state, 'graded');
    assert.equal(outcome.result?.pass, true, outcome.result?.reasons.join('; '));
    // The tool really ran: its sequence is in the result, not just a pass.
    assert.deepEqual(outcome.result?.sequence, ['list_invoices']);
  } finally {
    restore();
  }
});

test('a changed prompt marks the recording stale, not failed', async () => {
  const dir = withRecording(await currentHash(CASE, '\n- a rule added after the recording'));

  const outcome = await replayCase({ testCase: CASE, file: 'read-tools', recordingsDir: dir });
  assert.equal(outcome.state, 'stale');
  assert.equal(outcome.result, undefined, 'a stale recording has no verdict to grade');
});

test('a case with no recording is missing, which is not a failure either', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'evals-replay-'));
  const outcome = await replayCase({ testCase: CASE, file: 'read-tools', recordingsDir: dir });
  assert.equal(outcome.state, 'missing');
});

test('the prompt date is normalised, so a recording is not stale tomorrow', () => {
  const monday = "Today is November 14, 2026 in the user's own timezone (2026-11-14). The current month is November 2026. Rules.\n- one rule";
  const tuesday = "Today is November 15, 2026 in the user's own timezone (2026-11-15). The current month is November 2026. Rules.\n- one rule";
  assert.equal(recordingHash(monday, []), recordingHash(tuesday, []));
  // A real prompt edit still moves the hash.
  assert.notEqual(recordingHash(monday, []), recordingHash(`${monday}\n- a new rule`, []));
  // The rules after the date line are still part of what is hashed.
  assert.match(stablePrompt(monday), /Rules\.\n- one rule/);
});

test('a changed tool definition marks the recording stale', () => {
  const prompt = 'Today is November 14, 2026 (2026-11-14).';
  const tools = [{ name: 'list_invoices', description: 'before' }];
  const changed = [{ name: 'list_invoices', description: 'after' }];
  assert.notEqual(recordingHash(prompt, tools), recordingHash(prompt, changed));
});

test('a recording that runs out of responses fails the case, it does not hang', () => {
  const call = replayCall([RESPONSES[0]]);
  return Promise.all([call({ system: '', tools: [], messages: [] }), call({ system: '', tools: [], messages: [] })])
    .then(
      () => assert.fail('the third call should have thrown'),
      (error: Error) => assert.match(error.message, /ran out after 1/),
    );
});
