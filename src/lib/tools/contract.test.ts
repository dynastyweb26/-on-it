// The contract is the load-bearing part of the registry: a tool that is missing
// a field cannot exist, so the per-tool safety suite can trust that everything it
// loops over has a type, a risk, an output schema, a template and a fixture.
import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import {
  REQUIRED_FIELDS,
  assertComplete,
  buildRegistry,
  defineTool,
  inputSchemaJson,
  type ToolDefinition,
} from './contract';

function valid(overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  return defineTool({
    name: 'demo_tool',
    description: 'A read-only demonstration tool for the contract tests.',
    input: z.object({ limit: z.number().int().min(1).max(5).optional() }).strict(),
    output: z.object({ count: z.number().int() }),
    type: 'read',
    risk: 'low',
    defaultTemplate: { id: 'demo_card', props: z.object({ count: z.number().int() }) },
    handler: async () => ({ count: 1 }),
    fixture: { args: {}, result: { count: 1 } },
    ...overrides,
  } as Parameters<typeof defineTool>[0]);
}

test('a complete tool passes and keeps its fields', () => {
  const tool = valid();
  assert.equal(tool.name, 'demo_tool');
  assert.equal(tool.type, 'read');
  assert.equal(tool.risk, 'low');
  assert.equal(tool.defaultTemplate.id, 'demo_card');
});

test('every required field is required, and the error names the tool', () => {
  for (const field of REQUIRED_FIELDS) {
    const broken = { ...valid() } as Record<string, unknown>;
    delete broken[field];
    assert.throws(
      () => assertComplete(broken as unknown as ToolDefinition),
      new RegExp(`is incomplete:.*${field}`),
      `${field} must be required`,
    );
  }
});

test('wrong shapes are refused: bad type, bad risk, non-Zod schema, empty description', () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ['type', { type: 'destroy' }],
    ['risk', { risk: 'extreme' }],
    ['input', { input: { type: 'object' } }],
    ['output', { output: null }],
    ['defaultTemplate', { defaultTemplate: { id: 'Card With Spaces', props: z.object({}) } }],
    ['description', { description: 'too short' }],
    ['handler', { handler: 'nope' }],
  ];
  for (const [label, patch] of cases) {
    assert.throws(
      () => assertComplete({ ...valid(), ...patch } as unknown as ToolDefinition),
      /is incomplete/,
      `${label} must be refused`,
    );
  }
});

test('a fixture that contradicts the tool schemas fails at load', () => {
  assert.throws(
    () => valid({ fixture: { args: {}, result: { count: 'one' } } }),
    /fixture.result does not match its output schema/,
  );
  assert.throws(
    () => valid({ fixture: { args: { limit: 99 }, result: { count: 1 } } }),
    /fixture.args do not match its input schema/,
  );
});

test('the registry refuses duplicates and unknown names', () => {
  const tool = valid();
  assert.throws(() => buildRegistry([tool, tool]), /duplicate tool name: demo_tool/);

  const registry = buildRegistry([tool]);
  assert.equal(registry.find('nope_tool'), undefined);
  assert.throws(() => registry.get('nope_tool'), /unknown tool/);
  assert.deepEqual(registry.templates(), ['demo_card']);
});

test('the model only sees the tool name, description and its own input schema', () => {
  const [modelTool] = buildRegistry([valid()]).modelTools();
  assert.equal(modelTool.name, 'demo_tool');
  assert.match(modelTool.description ?? '', /demonstration/);
  const schema = modelTool.input_schema as Record<string, unknown>;
  assert.equal(schema.type, 'object');
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required ?? [], []);
  // The handler and the output schema never leak into the model's tool list.
  assert.equal(JSON.stringify(modelTool).includes('handler'), false);
  assert.equal(JSON.stringify(modelTool).includes('fixture'), false);
});

test('the model-facing schema is derived, never hand-written', () => {
  const tool = valid();
  const schema = inputSchemaJson(tool);
  const properties = schema.properties as Record<string, { type?: string }>;
  assert.equal(properties.limit.type, 'integer');
});
