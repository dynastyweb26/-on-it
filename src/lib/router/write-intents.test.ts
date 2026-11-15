// The router has to know what the app can CHANGE, and that list may not be
// hand-kept: it is the registry's write/send tools. The bug this guards is
// "add Ruth Lawrence as a client, 555-0100" reaching the invoice builder because
// the router had never heard of create_client.
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeIntentLines, writeIntents } from './write-intents';
import { routerSystem, ROUTER_SYSTEM } from './classify';
import { REGISTRY } from '@/lib/tools/registry';
import type { Registry, ToolDefinition } from '@/lib/tools/contract';

const changes = REGISTRY.list.filter((tool) => tool.type !== 'read');

test('every write or send tool is listed, with its own name and description', () => {
  const intents = writeIntents();
  assert.ok(intents.length > 0);
  assert.deepEqual(intents.map((i) => i.name), changes.map((t) => t.name));
  for (const intent of intents) {
    const tool = REGISTRY.get(intent.name);
    assert.ok(tool, intent.name);
    assert.equal(intent.description, tool.description);
    assert.notEqual(tool.type, 'read');
  }
});

test('the six record-changing tools are in the router list', () => {
  const names = writeIntents().map((i) => i.name);
  for (const name of [
    'create_client', 'edit_client', 'save_item', 'edit_expense',
    'delete_expense', 'delete_draft', 'edit_document_details',
  ]) {
    assert.ok(names.includes(name), name);
  }
});

test('the router prompt names each write tool and what it changes', () => {
  const prompt = routerSystem();
  for (const tool of changes) {
    assert.ok(prompt.includes(tool.name), tool.name);
    assert.ok(prompt.includes(tool.description), tool.name);
  }
  // The exact bug phrase's subject and a contact detail are on the router's map.
  assert.match(prompt, /create_client/);
  assert.match(prompt, /edit_client/);
  // Read tools stay out: the router asks about questions with its own rules.
  assert.equal(prompt.includes('unpaid:'), false);
});

test('the shipped prompt is the registry-built one', () => {
  assert.equal(ROUTER_SYSTEM, routerSystem());
});

test('a new write tool is routed without touching the router', () => {
  // A registry that grew by one tool: the list and the prompt grow with it, and
  // no file in this folder was edited to make that true.
  const added = {
    name: 'archive_job',
    description: 'Propose archiving ONE finished job.',
    type: 'write',
  } as unknown as ToolDefinition;
  const grown = {
    list: [...REGISTRY.list, added],
    find: () => undefined,
    get: (name: string) => (name === added.name ? added : REGISTRY.get(name)),
  } as unknown as Registry;

  assert.ok(writeIntents(grown).some((i) => i.name === 'archive_job'));
  assert.match(writeIntentLines(grown), /archive_job: Propose archiving ONE finished job\./);
  assert.match(routerSystem(grown), /archive_job/);
  assert.equal(routerSystem().includes('archive_job'), false);
});
