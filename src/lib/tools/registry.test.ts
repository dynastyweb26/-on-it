// The registry is data plus validation: one read-only tool, a bounded turn, and
// an argument schema that refuses anything it was not designed for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REGISTRY, TOOLS, cardFor, findTool, parseCall } from './registry';
import { buildRegistry } from './contract';
import { z } from 'zod';
import { TURN_MODEL_CALL_CAP } from './budget';
import { UNPAID_ROW_CAP } from './unpaid';
import { UNPAID_TOOL_NAME } from './definitions/unpaid';
import { TOOL_SYSTEM } from './prompt';

test('the registry holds the read-only lookups and nothing else yet', () => {
  const tool = REGISTRY.get(UNPAID_TOOL_NAME);
  assert.ok(tool, 'the unpaid lookup is registered');
  assert.deepEqual(TOOLS.map((t) => t.name).sort(), [UNPAID_TOOL_NAME, 'list_invoices', 'list_estimates', 'get_invoice', 'get_estimate', 'find_client', 'get_client_summary'].sort());
  assert.ok(REGISTRY.list.every((t) => t.type === 'read'), 'every registered tool is read-only');
  assert.equal(REGISTRY.get(UNPAID_TOOL_NAME).type, 'read');
  const modelTool = TOOLS.find((t) => t.name === UNPAID_TOOL_NAME);
  assert.ok(modelTool, 'the unpaid lookup is offered to the model');
  assert.equal(modelTool.input_schema.type, 'object');
  assert.equal(
    (modelTool.input_schema as { additionalProperties?: boolean }).additionalProperties,
    false
  );
  assert.match(tool.description ?? '', /read-only/i);
});

test('a tool may choose between the templates it declares, and no others', () => {
  const base = {
    name: 'two_cards',
    description: 'A tool that renders one of exactly two declared cards.',
    input: REGISTRY.get(UNPAID_TOOL_NAME).input,
    output: REGISTRY.get(UNPAID_TOOL_NAME).output,
    type: 'read' as const,
    risk: 'low' as const,
    defaultTemplate: REGISTRY.get(UNPAID_TOOL_NAME).defaultTemplate,
    destination: { screen: 'Invoices', path: '/invoices' },
    alternateTemplate: { id: 'nav.link' as const, props: z.object({}) },
    templateFor: () => 'nav.link' as const,
    handler: async () => ({}),
    fallback: () => 'text',
    fixture: REGISTRY.get(UNPAID_TOOL_NAME).fixture,
  };
  const built = buildRegistry([base as never]).get('two_cards');
  assert.equal(cardFor(built, built.fixture.result)?.id, 'nav.link');
  assert.throws(
    () => buildRegistry([{ ...base, templateFor: () => 'stat.tiles' } as never]),
    /did not declare/,
  );
  // null is always allowed: it means a plain text answer with no card.
  const plain = buildRegistry([{ ...base, templateFor: () => null } as never]).get('two_cards');
  assert.equal(cardFor(plain, plain.fixture.result), null);
});

test('a turn may spend eight model calls at most, across every AI route', () => {
  assert.equal(TURN_MODEL_CALL_CAP, 8);
});

test('arguments: nothing is fine, nonsense is refused', () => {
  assert.equal(parseCall(UNPAID_TOOL_NAME, {}).ok, true);
  assert.equal(parseCall(UNPAID_TOOL_NAME, { min_balance: 250 }).ok, true);
  assert.equal(parseCall(UNPAID_TOOL_NAME, { limit: UNPAID_ROW_CAP }).ok, true);
  assert.equal(parseCall(UNPAID_TOOL_NAME, { limit: UNPAID_ROW_CAP + 1 }).ok, false);
  assert.equal(parseCall(UNPAID_TOOL_NAME, { min_balance: -1 }).ok, false);
  assert.equal(parseCall(UNPAID_TOOL_NAME, { limit: 1.5 }).ok, false);
  assert.equal(parseCall(UNPAID_TOOL_NAME, { sort: 'client' }).ok, false);
});

test('an unknown tool name is refused, never executed', () => {
  const parsed = parseCall('delete_everything', {});
  assert.equal(parsed.ok, false);
  if (!parsed.ok) assert.equal(parsed.reason, 'unknown_tool');
  assert.equal(findTool('delete_everything'), undefined);
});

test('the system prompt forbids money and emoji and names the right document word', () => {
  assert.equal(/\p{Extended_Pictographic}/u.test(TOOL_SYSTEM), false);
  assert.equal(/quote/i.test(TOOL_SYSTEM), false);
  assert.match(TOOL_SYSTEM, /estimate/);
  assert.match(TOOL_SYSTEM, /NEVER write a dollar figure/);
  assert.match(TOOL_SYSTEM, /READ-ONLY/);
});

test('the template a tool renders into is declared in the registry', () => {
  assert.deepEqual(REGISTRY.templates().slice().sort(), ['list.ranked', 'nav.link', 'stat.tiles']);
});

test('a card is handed over only when the template accepts the result', () => {
  const tool = REGISTRY.get(UNPAID_TOOL_NAME);
  const result = tool.output.parse(tool.fixture.result);

  const card = cardFor(tool, result);
  assert.ok(card, 'the fixture renders');
  assert.equal(card.id, 'list.ranked');
  assert.deepEqual(card.props, {
    eyebrow: 'Who owes you',
    rows: [{
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Maria Santos',
      secondary: 'INV-0042 · Due Oct 1',
      amount: '$120.00',
      tone: 'neutral',
      chip: { tone: 'late', label: '42d late' },
    }],
    totalCount: 1,
    total: { label: 'Owed to you · 1 client', amount: '$120.00', tone: 'neutral' },
  });

  // Data the template does not accept is not drawn as a makeshift card.
  assert.equal(cardFor(REGISTRY.get(UNPAID_TOOL_NAME), { rows: 'nope' }), null);
  assert.equal(cardFor(tool, null), null);
});
