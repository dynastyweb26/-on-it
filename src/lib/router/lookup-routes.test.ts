// A lookup spoken as a command has no question mark: "find Ruth", "show me my
// invoices", "pull up the Smith estimate". The router prompt names those verbs,
// and the regex fallback has to recognise the same shapes for when the router
// times out. Before this, every one of them fell through to /api/parse and no
// tool ever ran.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideRoute } from './decide';
import { COMMAND_BUILDS, COMMAND_LOOKUPS } from './__fixtures__/phrases';

const viaFallback = (text: string) =>
  decideRoute({ flagOn: true, bypass: null, classified: null, text });

test('at least six command-phrased lookups route to ask with the router down', () => {
  assert.ok(COMMAND_LOOKUPS.length >= 6, 'the fixtures cover at least six lookups');
  for (const { text } of COMMAND_LOOKUPS) {
    assert.deepEqual(viaFallback(text), { route: 'ask', via: 'regex' }, text);
  }
});

test('create, record and send commands still go to build', () => {
  for (const { text } of COMMAND_BUILDS) {
    assert.deepEqual(viaFallback(text), { route: 'build', via: 'regex' }, text);
  }
});
