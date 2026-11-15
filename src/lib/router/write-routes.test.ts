// The preview bug, as fixtures: "add Ruth Lawrence as a client, 555-0100" went to
// the invoice builder and create_client never ran. The router now knows the write
// tools (from the registry), and the fallback applies the same rule when
// /api/route is down. Both directions are pinned here: what a write tool covers
// is ask, whatever digits it has; the builder's own shapes are build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideRoute } from './decide';
import { coveredByWriteTool } from './covers-write';
import { BUILD_COMMANDS, WRITE_COMMANDS } from './__fixtures__/phrases';

/** The router up: the model's word is in hand (and is the wrong one here). */
const viaRouter = (text: string, classified: 'ask' | 'build' | null = 'build') =>
  decideRoute({ flagOn: true, bypass: null, classified, text, covered: coveredByWriteTool(text) });

/** The router down: classifyTurn returned null, so only the rules decide. */
const viaFallback = (text: string) =>
  decideRoute({ flagOn: true, bypass: null, classified: null, text, covered: coveredByWriteTool(text) });

test('every covered write command routes to ask with the router up', () => {
  assert.ok(WRITE_COMMANDS.length >= 6);
  for (const { text } of WRITE_COMMANDS) {
    assert.equal(coveredByWriteTool(text), true, text);
    assert.deepEqual(viaRouter(text), { route: 'ask', via: 'regex' }, text);
  }
});

test('every covered write command routes to ask with the router down', () => {
  for (const { text } of WRITE_COMMANDS) {
    assert.deepEqual(viaFallback(text), { route: 'ask', via: 'regex' }, text);
  }
});

test('the builder keeps its own shapes, router up or down', () => {
  assert.ok(BUILD_COMMANDS.length >= 5);
  for (const { text } of BUILD_COMMANDS) {
    assert.equal(coveredByWriteTool(text), false, text);
    assert.equal(viaRouter(text).route, 'build', text);
    assert.equal(viaFallback(text).route, 'build', text);
  }
});

test('a job in progress beats a covered change, even mid-sentence', () => {
  for (const bypass of ['clarification', 'voice-followup'] as const) {
    assert.deepEqual(
      decideRoute({
        flagOn: true,
        bypass,
        classified: null,
        text: 'add a line for the filter',
        covered: coveredByWriteTool('add a line for the filter'),
      }),
      { route: 'build', via: 'bypass' },
    );
  }
});
