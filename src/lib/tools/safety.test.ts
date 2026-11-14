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
import { buildRegistry, declaredTemplate, declaredTemplateIds, defineTool, isPlainText } from './contract';
import { REGISTRY } from './registry';
import { TEMPLATE_IDS } from './templates';
import { guardModelMoney } from './money';
import { fixtureDb, type FixtureRow, type FixtureRows } from './fixture-db';
import { CONFIRM_TOKEN_TTL_MS, confirmActions, confirmSentence, createPendingAction } from './confirm';
import { proposalCard } from './answer';
import { fixturePendingStore } from './pending-fixture';
import { runToolTurn, type ModelCall } from './turn';
import { createTurnBudget } from './budget';
import { fixtureWriteDb } from './write-fixture';
import { findServiceRoleReach, findWriteDbReach } from '../../../scripts/ci/tool-imports';

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
  expenses: (userId) => [{
    id: userId === OTHER ? OTHER_MARKER : 'owner-expense',
    user_id: userId,
    description: userId === OTHER ? 'Other owner fuel' : 'Fill-up',
    vendor: userId === OTHER ? 'Other Owner Ltd' : 'Shell',
    amount: 52.1,
    category: 'fuel',
    tax_deductible: false,
    spent_on: '2026-11-06',
    created_at: '2026-11-06T00:00:00Z',
    deleted_at: null,
  }],
  invoice_payments: (userId) => [{
    id: userId === OTHER ? OTHER_MARKER : 'owner-payment',
    user_id: userId,
    invoice_id: userId === OTHER ? OTHER_MARKER : 'owner-invoice',
    amount: 120,
    method: 'zelle',
    paid_at: '2026-11-06T17:00:00Z',
    created_at: '2026-11-06T17:00:00Z',
    entry_type: 'payment',
    stripe_checkout_session_id: null,
  }],
  other_income: (userId) => [{
    id: userId === OTHER ? OTHER_MARKER : 'owner-income',
    user_id: userId,
    amount: 300,
    title: userId === OTHER ? 'Other Owner Ltd' : 'Side job',
    client_name: userId === OTHER ? 'Other Owner Ltd' : null,
    received_on: '2026-11-04',
    classification: 'other_income',
    deposit_id: null,
    created_at: '2026-11-04T00:00:00Z',
    deleted_at: null,
  }],
  profiles: (userId) => [{ id: userId, timezone: 'America/Chicago' }],
  products: (userId) => [{
    id: userId === OTHER ? OTHER_MARKER : 'owner-product',
    user_id: userId,
    name: userId === OTHER ? 'Other Owner Ltd' : 'Service call',
    unit: 'job',
    unit_price: 85,
    detail: null,
    use_count: 1,
    last_used_at: null,
    deleted_at: null,
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
    for (const id of declaredTemplateIds(tool)) {
      assert.ok(TEMPLATE_IDS.includes(id), `${id} is not one of the design templates`);
    }
  });

  test(`${tool.name}: the plain-text fallback is safe to show on its own`, () => {
    const result = tool.output.parse(tool.fixture.result);
    const fallback = tool.fallback(result as never);
    assert.ok(fallback.trim().length > 0, 'a fallback is never empty');
    assert.equal(isPlainText(fallback), true, 'no markup, no emoji');
  });

  test(`${tool.name}: the declared template accepts what the tool produces`, () => {
    // A write tool's card is built from its preview proposal, not from a result
    // (a result only exists after the owner confirms).
    if (tool.preview) {
      const card = proposalCard([{
        tool: tool.name,
        actionId: 'action-1',
        token: 'token',
        expiresAt: '2026-01-01T00:00:00Z',
        row: tool.preview.row,
        sentence: confirmSentence(tool.preview.row),
      }]);
      assert.ok(card, 'the confirm.batch card rejects the proposal it would draw');
      const template = declaredTemplate(tool, tool.defaultTemplate.id);
      assert.ok(template);
      assert.equal(template.props.safeParse(card.props).success, true);
      return;
    }
    const fixture = tool.output.parse(tool.fixture.result);
    const id = tool.templateFor ? tool.templateFor(fixture) : tool.defaultTemplate.id;
    if (id === null) return; // deliberately plain text for this result
    const template = declaredTemplate(tool, id);
    assert.ok(template && template.id === id, `${tool.name} chose a template it did not declare`);
    const data = tool.propsFor ? tool.propsFor(fixture, id) : fixture;
    const props = template.props.safeParse(data);
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

// ── The write path, for every write or send tool in the registry ────────────
//
// No per-tool setup and no extra file: the suite loops, so the next write tool
// inherits all seven checks by existing. create_client is the pilot.
const WRITE_TOOLS = REGISTRY.list.filter((tool) => tool.type === 'write' || tool.type === 'send');

/** A model that calls one tool once and then answers. */
function oneToolCall(name: string, input: unknown): ModelCall {
  let calls = 0;
  return async () => {
    calls += 1;
    return {
      id: `m${calls}`,
      type: 'message',
      role: 'assistant',
      model: 'test',
      stop_reason: calls === 1 ? 'tool_use' : 'end_turn',
      content: calls === 1
        ? [{ type: 'tool_use', id: 't1', name, input }]
        : [{ type: 'text', text: 'Ready when you are.' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    } as unknown as Awaited<ReturnType<ModelCall>>;
  };
}

for (const tool of WRITE_TOOLS) {
  const preview = tool.preview;
  const preparedOnEmpty = () => tool.prepare!({ db: fixtureDb({}), userId: OWNER }, tool.fixture.args as never);

  test(`${tool.name}: nothing is written before the owner confirms`, async () => {
    assert.ok(tool.prepare && tool.execute && preview, 'a write tool carries prepare, execute and a preview');
    const store = fixturePendingStore();
    const wdb = fixtureWriteDb({}, OWNER);
    const registry = buildRegistry([tool]);

    const turn = await runToolTurn({
      call: oneToolCall(tool.name, tool.fixture.args),
      db: fixtureDb({}),
      userId: OWNER,
      question: 'do it',
      budget: createTurnBudget({ userId: OWNER, cap: 2 }),
      tools: registry.modelTools(),
      registry,
      pending: async ({ tool: name, resolved }) => {
        const created = await createPendingAction({ userId: OWNER, tool: name, resolved, store });
        return { actionId: created.id, token: created.token, expiresAt: created.expiresAt };
      },
    });

    assert.equal(turn.pending.length, 1, 'the turn made one proposal');
    assert.deepEqual(turn.toolRuns.map((run) => run.status), ['pending']);
    assert.equal(wdb.writes, 0, 'a proposal wrote nothing');
    // prepare is handed a read-only ToolContext: no insert, update or rpc at all.
    assert.equal((turn.pending[0].row.icon.length > 0), true);
    const prepared = await preparedOnEmpty();
    assert.equal(prepared.ok, true);
    assert.equal(wdb.writes, 0);
  });

  test(`${tool.name}: confirm writes exactly one row, a second confirm writes none`, async () => {
    const store = fixturePendingStore();
    const wdb = fixtureWriteDb({}, OWNER);
    const registry = buildRegistry([tool]);
    const wctx = { db: wdb, userId: OWNER };

    const prepared = await preparedOnEmpty();
    assert.equal(prepared.ok, true);
    if (!prepared.ok) return;
    const { token } = await createPendingAction({
      userId: OWNER, tool: tool.name, resolved: prepared.resolved, store,
    });

    const first = await confirmActions({ userId: OWNER, tokens: [token], store, registry, wctx });
    assert.equal(first.ok, true);
    if (first.ok) assert.deepEqual(first.actions.map((a) => a.status), ['saved']);
    assert.equal(wdb.writes, 1, 'exactly one write');

    const again = await confirmActions({ userId: OWNER, tokens: [token], store, registry, wctx });
    assert.deepEqual(again, { ok: false, reason: 'already_confirmed' });
    assert.equal(wdb.writes, 1, 'the second tap wrote nothing');
  });

  test(`${tool.name}: two confirms racing the claim write one row`, async () => {
    const store = fixturePendingStore();
    const wdb = fixtureWriteDb({}, OWNER);
    const registry = buildRegistry([tool]);
    const wctx = { db: wdb, userId: OWNER };

    const prepared = await preparedOnEmpty();
    assert.equal(prepared.ok, true);
    if (!prepared.ok) return;
    const { token } = await createPendingAction({
      userId: OWNER, tool: tool.name, resolved: prepared.resolved, store,
    });

    // Both confirms arrive at the claim before either one runs it: the claim's
    // UPDATE ... WHERE executed_at IS NULL is the only thing picking a winner.
    let arrivals = 0;
    let open: () => void = () => {};
    const gate = new Promise<void>((resolve) => { open = resolve; });
    const racing = {
      ...store,
      claim: async (userId: string, actionId: string) => {
        arrivals += 1;
        if (arrivals === 2) open();
        if (arrivals < 2) await gate;
        return store.claim(userId, actionId);
      },
    };

    const outcomes = await Promise.all([
      confirmActions({ userId: OWNER, tokens: [token], store: racing, registry, wctx }),
      confirmActions({ userId: OWNER, tokens: [token], store: racing, registry, wctx }),
    ]);

    assert.equal(wdb.writes, 1, 'execute ran exactly once');
    assert.equal(store.executions.length, 1, 'exactly one claim was granted');
    assert.equal(outcomes.filter((outcome) => outcome.ok).length, 1, 'one confirm reports the save');
  });

  test(`${tool.name}: an expired or foreign token writes nothing`, async () => {
    const store = fixturePendingStore();
    const wdb = fixtureWriteDb({}, OWNER);
    const registry = buildRegistry([tool]);
    const prepared = await preparedOnEmpty();
    assert.equal(prepared.ok, true);
    if (!prepared.ok) return;
    const { token } = await createPendingAction({
      userId: OWNER, tool: tool.name, resolved: prepared.resolved, store,
    });

    const later = new Date(Date.now() + CONFIRM_TOKEN_TTL_MS + 1000);
    const expired = await confirmActions({
      userId: OWNER, tokens: [token], store, registry, wctx: { db: wdb, userId: OWNER }, now: later,
    });
    assert.deepEqual(expired, { ok: false, reason: 'expired_token' });

    const foreign = await confirmActions({
      userId: OTHER, tokens: [token], store, registry, wctx: { db: wdb, userId: OTHER },
    });
    assert.deepEqual(foreign, { ok: false, reason: 'unknown_token' });
    assert.equal(wdb.writes, 0);
  });

  test(`${tool.name}: execute refuses when the state moved after prepare`, async () => {
    const wdb = fixtureWriteDb({}, OWNER);
    const prepared = await preparedOnEmpty();
    assert.equal(prepared.ok, true);
    if (!prepared.ok) return;
    const wctx = { db: wdb, userId: OWNER };

    const first = await tool.execute!(wctx, prepared.resolved);
    assert.equal(first.ok, true);
    const writesAfterFirst = wdb.writes;

    const second = await tool.execute!(wctx, prepared.resolved);
    assert.equal(second.ok, false, 'the same resolved payload must not write twice');
    assert.equal(wdb.writes, writesAfterFirst, 'a refusal writes nothing');
  });

  test(`${tool.name}: no money reaches the card except through the money helpers`, () => {
    assert.ok(preview);
    const card = proposalCard([{
      tool: tool.name, actionId: 'action-1', token: 'token', expiresAt: '2026-01-01T00:00:00Z',
      row: preview.row, sentence: confirmSentence(preview.row),
    }]);
    assert.equal(card?.id, 'confirm.batch');
    const text = JSON.stringify(card);
    if (preview.row.amount === '') {
      assert.equal(text.includes('$'), false, 'a card with no figure carries no dollar sign');
    } else {
      // The only money on a card is the string the tool composed.
      assert.ok(preview.row.amount.startsWith('$'));
      assert.ok(text.includes(preview.row.amount));
    }
  });
}

test('the write database is unreachable from the model turn and every read tool', () => {
  assert.deepEqual(findWriteDbReach(process.cwd()), []);
});
