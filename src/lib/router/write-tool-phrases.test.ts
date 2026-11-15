// The fallback cannot import the registry (it ships to the browser), so nothing
// at runtime would notice a new write tool it does not recognise. This test is
// that notice: load the registry here and fail when a write or send tool has no
// fallback phrase, or when its phrase does not route to ask.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REGISTRY } from '@/lib/tools/registry';
import { isWriteCommand } from './write-commands';
import { WRITE_TOOL_PHRASES } from './__fixtures__/write-tool-phrases';

const changing = REGISTRY.list.filter((tool) => tool.type !== 'read');

test('every registered write or send tool has a fallback phrase that routes to ask', () => {
  for (const tool of changing) {
    const phrase = WRITE_TOOL_PHRASES[tool.name];
    assert.ok(phrase, `${tool.name} has no fallback phrase: add one to write-tool-phrases.ts`);
    assert.equal(isWriteCommand(phrase), true, `${tool.name}: "${phrase}" does not route to ask`);
  }
});

test('the phrase list has no entries for tools that no longer exist', () => {
  const names = new Set(changing.map((tool) => tool.name));
  for (const name of Object.keys(WRITE_TOOL_PHRASES)) {
    assert.ok(names.has(name), `${name} is not a registered write tool`);
  }
  assert.ok(changing.length > 0);
});
