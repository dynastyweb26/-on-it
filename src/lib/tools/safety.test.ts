// ═══ The shared tool safety suite ═══
//
// One suite, looped over every tool in the registry, so a new tool inherits the
// whole checklist without writing its own tests:
//
//   1. the definition is complete and its fixture satisfies its own schemas
//   2. the template it declares accepts what it produces
//   3. money in its result is server-composed and the guard knows those figures
//   4. the guard fails a figure the result does not hold
//   5. another user's rows never reach the output
//   6. a read tool over an empty database invents nothing
//   7. a write or send tool cannot run without a confirm token, and a replayed
//      confirm writes one row
//   8. no tool reaches the service-role client, directly or through a helper
//
// It runs offline: fixtures for data, no network, no live project, no skips.
import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { buildRegistry, defineTool, isPlainText, type ToolDb } from './contract';
import { REGISTRY } from './registry';
import { TEMPLATE_IDS } from './templates';
import { guardModelMoney } from './money';
import { fixtureDb, type FixtureRow, type FixtureRows } from './fixture-db';
import { confirmActions, createPendingAction } from './confirm';
import { fixturePendingStore } from './pending-fixture';
import { runToolTurn, type ModelCall } from './turn';
import { createTurnBudget } from './budget';
import { findServiceRoleReach } from '../../../scripts/ci/tool-imports';

const OWNER = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';
const OTHER_MARKER = 'other-owner-row';

/**
 * Real rows for the tables tools read, one set per user. Adding a tool over a
 * new table means adding its fixture here — the isolation loop then covers it.
 */
const ROWS: Record<string, (userId: string) => FixtureRow[]> = {
  invoices: (userId) => [{
    id: userId === OTHER ? OTHER_MARKER : 'owner-invoice',
    user_id: userId,
    kind: 'invoice',
    invoice_number: 7,
    client_name: userId === OTHER ? 'Other Owner Ltd' : 'Maria Santos',
    total: 120,
    amount_paid: 0,
    due_date: '2026-10-01',
    status: 'sent',
    deleted_at: null,
  }],
  clients: (userId) => [{
    id: userId === OTHER ? OTHER_MARKER : 'owner-client',
    user_id: userId,
    name: userId === OTHER ? 'Other Owner Ltd' : 'Maria Santos',
    email: 'maria@example.com',
    phone: null,
    address: null,
  }],
};

const tables = Object.keys(ROWS);

function dbWithBothUsers(): ReturnType<typeof fixtureDb> {
  const rows: FixtureRows = Object.fromEntries(
    tables.map((table) => [table, [...ROWS[table](OWNER), ...ROWS[table](OTHER)]]),
  );
  return fixtureDb(rows);
}

const outputText = (value: unknown): string => JSON.stringify(value ?? null);

for (const tool of REGISTRY.list) {
  test(`${tool.name}: the definition and its fixture are valid`, () => {
    assert.ok(tool.input.safeParse(tool.fixture.args).success);
    assert.ok(tool.output.safeParse(tool.fixture.result).success);
    assert.ok(
      TEMPLATE_IDS.includes(tool.defaultTemplate.id),
      `${tool.defaultTemplate.id} is not one of the design templates`,
    );
  });

  test(`${tool.name}: the plain-text fallback is safe to show on its own`, () => {
    const result = tool.output.parse(tool.fixture.result);
    const fallback = tool.fallback(result as never);
    assert.ok(fallback.trim().length > 0, 'a fallback is never empty');
    assert.equal(isPlainText(fallback), true, 'no markup, no emoji');
  });

  test(`${tool.name}: the declared template accepts what the tool produces`, () => {
    const fixture = tool.output.parse(tool.fixture.result);
    const id = tool.templateFor ? tool.templateFor(fixture) : tool.defaultTemplate.id;
    if (id === null) return; // deliberately plain text for this result
    const template = id === tool.defaultTemplate.id ? tool.defaultTemplate : tool.alternateTemplate;
    assert.ok(template && template.id === id, `${tool.name} chose a template it did not declare`);
    const props = template.props.safeParse(fixture);
    assert.equal(props.success, true, `${template.id} rejects its own result`);
  });

  test(`${tool.name}: money in the result is server-composed and grounded`, () => {
    const result = tool.output.parse(tool.fixture.result);
    const text = 'Here is the figure: $12,345.67.';
    // A figure nowhere in the result must fail...
    assert.equal(guardModelMoney(text, [result]).ok, false);
    // ...and a figure the result composes must pass.
    const [figure] = outputText(result).match(/\$\s?[\d,]+\.\d{2}/) ?? [];
    if (figure) {
      assert.equal(guardModelMoney(`That is ${figure}.`, [result]).ok, true);
    }
  });

  test(`${tool.name}: another user's rows never reach the caller`, async () => {
    const db = dbWithBothUsers();
    const output = await tool.handler({ db, userId: OWNER }, tool.fixture.args as never);
    const text = outputText(output);
    assert.equal(text.includes(OTHER_MARKER), false, 'foreign row leaked');
    assert.equal(text.includes('Other Owner Ltd'), false, 'foreign client leaked');
    assert.equal(db.attempts, 0, 'a tool turn is not a write path');
  });

  if (tool.type === 'read' || tool.type === 'nav' || tool.type === 'meta') {
    test(`${tool.name}: an empty database invents nothing`, async () => {
      const db = fixtureDb({});
      const output = await tool.handler({ db, userId: OWNER }, tool.fixture.args as never);
      assert.ok(tool.output.safeParse(output).success);
      // No rows is not an error and not an invented client. A zero total is the
      // server's own sentence, which is exactly what an owner with nothing
      // outstanding should hear.
      const shape = output as { rows?: unknown[] };
      assert.deepEqual(shape.rows ?? [], [], 'no rows invented from no data');
      assert.equal(db.attempts, 0);
    });
  }
}

test('the service-role client is unreachable from every tool', () => {
  const root = process.cwd();
  assert.deepEqual(findServiceRoleReach(root), []);
});

// ── The write path, proven with a synthetic tool until a real one lands ──────
function writeTool(counter: { rows: number }) {
  return defineTool({
    name: 'safety_write',
    description: 'Synthetic write tool used to prove the confirm scaffold.',
    input: z.object({ value: z.number() }).strict(),
    output: z.object({ rows: z.number().int() }),
    type: 'write',
    risk: 'high',
    defaultTemplate: { id: 'confirm.batch', props: z.object({ rows: z.number().int() }) },
    handler: async (_ctx, args) => {
      counter.rows += 1;
      return { rows: counter.rows + args.value * 0 };
    },
    fallback: () => 'Saved.',
    fixture: { args: { value: 1 }, result: { rows: 1 } },
  });
}

const registryForWrite = (counter: { rows: number }) => buildRegistry([writeTool(counter)]);
const emptyDb: ToolDb = fixtureDb({});

test('a write tool without a confirm token never runs', async () => {
  const counter = { rows: 0 };
  const registry = registryForWrite(counter);
  const tool = registry.get('safety_write');

  let calls = 0;
  const modelCallsWrite: ModelCall = async () => {
    calls += 1;
    return {
      id: 'm1',
      type: 'message',
      role: 'assistant',
      model: 'test',
      stop_reason: calls === 1 ? 'tool_use' : 'end_turn',
      content: calls === 1
        ? [{ type: 'tool_use', id: 't1', name: 'safety_write', input: { value: 1 } }]
        : [{ type: 'text', text: 'Ready when you are.' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    } as unknown as Awaited<ReturnType<ModelCall>>;
  };

  const result = await runToolTurn({
    call: modelCallsWrite,
    db: emptyDb,
    userId: OWNER,
    question: 'record it',
    budget: createTurnBudget({ userId: OWNER }),
    tools: registry.modelTools(),
    registry,
  });

  assert.equal(counter.rows, 0, 'proposal only');
  assert.deepEqual(result.toolRuns.map((r) => r.status), ['error']);
  assert.equal(tool.name, 'safety_write');
});

test('a confirmed write runs once, and the replay writes nothing', async () => {
  const counter = { rows: 0 };
  const registry = registryForWrite(counter);
  const store = fixturePendingStore();

  let calls = 0;
  const modelCallsWrite: ModelCall = async () => {
    calls += 1;
    return {
      id: 'm',
      type: 'message',
      role: 'assistant',
      model: 'test',
      stop_reason: calls === 1 ? 'tool_use' : 'end_turn',
      content: calls === 1
        ? [{ type: 'tool_use', id: 't', name: 'safety_write', input: { value: 1 } }]
        : [{ type: 'text', text: 'Ready when you are.' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    } as unknown as Awaited<ReturnType<ModelCall>>;
  };

  const turn = await runToolTurn({
    call: modelCallsWrite,
    db: emptyDb,
    userId: OWNER,
    question: 'record it',
    budget: createTurnBudget({ userId: OWNER, cap: 2 }),
    tools: registry.modelTools(),
    registry,
    pending: async ({ tool, args }) => {
      const created = await createPendingAction({ userId: OWNER, tool, args, store });
      return { actionId: created.id, token: created.token, expiresAt: created.expiresAt, tool };
    },
  });

  assert.equal(turn.pending.length, 1);
  assert.equal(counter.rows, 0);

  const first = await confirmActions({
    userId: OWNER,
    tokens: [turn.pending[0].token],
    idempotencyKey: 'safety-key-1',
    store,
    registry,
    db: emptyDb,
  });
  assert.equal(first.ok, true);
  assert.equal(counter.rows, 1);

  const replay = await confirmActions({
    userId: OWNER,
    tokens: [turn.pending[0].token],
    idempotencyKey: 'safety-key-1',
    store,
    registry,
    db: emptyDb,
  });
  assert.equal(replay.ok, true);
  if (replay.ok) assert.equal(replay.replayed, true);
  assert.equal(counter.rows, 1, 'one row, however many taps');
});
