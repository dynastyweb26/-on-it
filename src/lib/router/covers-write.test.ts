// The preview routed "add Ruth Lawrence as a client, 555-0100" to the invoice
// builder: a figure meant "job", and the router had never heard of create_client.
// A write tool the registry has now wins before that rule, with the router up
// (decideRoute on the classification) or down (the regex fallback).
import test from 'node:test';
import assert from 'node:assert/strict';
import { coveredByWriteTool } from './covers-write';
import { decideRoute } from './decide';

test('a client add with a phone number is a change, not a job', () => {
  assert.equal(coveredByWriteTool('add Ruth Lawrence as a client, 555-0100'), true);
});

test('a new invoice with a price is still a job', () => {
  assert.equal(coveredByWriteTool('invoice ZZ Test A $50 for a repair'), false);
});

test('the covered rule runs before the figure rule, with or without a model answer', () => {
  for (const classified of [null, 'build' as const]) {
    assert.deepEqual(
      decideRoute({
        flagOn: true,
        bypass: null,
        classified,
        text: 'add Ruth Lawrence as a client, 555-0100',
        covered: true,
      }),
      { route: 'ask', via: 'regex' },
    );
  }
});

test('a job already in progress still owns the turn', () => {
  assert.deepEqual(
    decideRoute({ flagOn: true, bypass: 'clarification', classified: null, text: 'add a client', covered: true }),
    { route: 'build', via: 'bypass' },
  );
});

test('flag off keeps the old path: same rule, no change in behavior', () => {
  assert.deepEqual(
    decideRoute({
      flagOn: false,
      bypass: null,
      classified: 'ask',
      text: 'add Ruth Lawrence as a client, 555-0100',
      covered: true,
    }),
    { route: 'build', via: 'regex' },
  );
});
