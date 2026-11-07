import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, RouterOutput } from './classify';

test('a valid tool input becomes its route', async () => {
  assert.equal(await classify('x', async () => ({ route: 'ask' })), 'ask');
  assert.equal(await classify('x', async () => ({ route: 'build' })), 'build');
  assert.equal(await classify('x', async () => ({ route: 'unsupported' })), 'unsupported');
});

test('unknown extras are ignored, an unknown route is not', async () => {
  assert.equal(await classify('x', async () => ({ route: 'build', confidence: 0.9 })), 'build');
  assert.equal(await classify('x', async () => ({ route: 'invoice' })), null);
});

test('garbage, an empty object, null, a string and a thrown error all mean null', async () => {
  assert.equal(await classify('x', async () => null), null);
  assert.equal(await classify('x', async () => 'ask'), null);
  assert.equal(await classify('x', async () => ({})), null);
  assert.equal(await classify('x', async () => ({ route: 42 })), null);
  assert.equal(
    await classify('x', async () => {
      throw new Error('boom');
    }),
    null,
  );
});

test('a slow call is cut at the ceiling and aborted', async () => {
  let aborted = false;
  const startedAt = Date.now();
  const route = await classify(
    'x',
    ({ signal }) =>
      new Promise((_, reject) => {
        signal.addEventListener('abort', () => {
          aborted = true;
          reject(new Error('aborted'));
        });
      }),
    40,
  );
  assert.equal(route, null);
  assert.equal(aborted, true);
  assert.ok(Date.now() - startedAt < 1000, 'did not honour the ceiling');
});

test('an empty message never spends a call', async () => {
  let called = false;
  assert.equal(
    await classify('   ', async () => {
      called = true;
      return { route: 'ask' };
    }),
    null,
  );
  assert.equal(called, false);
});

test('the model sees sanitized text, wrapped by the caller', async () => {
  let seen = '';
  await classify('<b>who owes me</b>', async ({ message }) => {
    seen = message;
    return { route: 'ask' };
  });
  assert.equal(seen.includes('<'), false);
  assert.equal(seen.includes('‹b›who owes me‹/b›'), true);
});

test('the output schema is enum-only', () => {
  assert.equal(RouterOutput.safeParse({ route: 'ask' }).success, true);
  assert.equal(RouterOutput.safeParse({ route: 'ask', amount: 50 }).success, true);
  assert.equal(RouterOutput.safeParse({ route: 'other' }).success, false);
});
