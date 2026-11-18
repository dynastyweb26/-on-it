// Render crashes reach Sentry: both error boundaries report what they catch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('the app shell boundary and the route boundary both report to Sentry', () => {
  assert.match(read('components/AppErrorBoundary.tsx'), /Sentry\.captureException\(error, \{ contexts: \{ react:/);
  assert.match(read('app/error.tsx'), /Sentry\.captureException\(error\)/);
});
