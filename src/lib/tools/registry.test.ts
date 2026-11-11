// The registry is data plus validation: one read-only tool, a bounded turn, and
// an argument schema that refuses anything it was not designed for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_MODEL_CALLS,
  TOOLS,
  TOOL_SYSTEM,
  UNPAID_TOOL_NAME,
  parseToolArgs,
} from './unpaid-legacy';
import { UNPAID_ROW_CAP } from './unpaid';

test('exactly one tool, and it is the read-only unpaid lookup', () => {
  const tool = TOOLS[0];
  assert.ok(tool, 'the registry has a tool');
  assert.equal(TOOLS.length, 1);
  assert.equal(tool.name, UNPAID_TOOL_NAME);
  assert.equal(tool.input_schema.type, 'object');
  assert.equal(
    (tool.input_schema as { additionalProperties?: boolean }).additionalProperties,
    false
  );
  assert.match(tool.description ?? '', /read-only/i);
});

test('a turn may spend three model calls at most', () => {
  assert.equal(MAX_MODEL_CALLS, 3);
});

test('arguments: nothing is fine, nonsense is refused', () => {
  assert.equal(parseToolArgs(UNPAID_TOOL_NAME, {}).ok, true);
  assert.equal(parseToolArgs(UNPAID_TOOL_NAME, { min_balance: 250 }).ok, true);
  assert.equal(parseToolArgs(UNPAID_TOOL_NAME, { limit: UNPAID_ROW_CAP }).ok, true);
  assert.equal(parseToolArgs(UNPAID_TOOL_NAME, { limit: UNPAID_ROW_CAP + 1 }).ok, false);
  assert.equal(parseToolArgs(UNPAID_TOOL_NAME, { min_balance: -1 }).ok, false);
  assert.equal(parseToolArgs(UNPAID_TOOL_NAME, { limit: 1.5 }).ok, false);
  assert.equal(parseToolArgs(UNPAID_TOOL_NAME, { sort: 'client' }).ok, false);
});

test('an unknown tool name is refused, never executed', () => {
  const parsed = parseToolArgs('delete_everything', {});
  assert.equal(parsed.ok, false);
  if (!parsed.ok) assert.equal(parsed.reason, 'unknown_tool');
});

test('the system prompt forbids money and emoji and names the right document word', () => {
  assert.equal(/\p{Extended_Pictographic}/u.test(TOOL_SYSTEM), false);
  assert.equal(/quote/i.test(TOOL_SYSTEM), false);
  assert.match(TOOL_SYSTEM, /estimate/);
  assert.match(TOOL_SYSTEM, /NEVER write a dollar figure/);
  assert.match(TOOL_SYSTEM, /READ-ONLY/);
});
