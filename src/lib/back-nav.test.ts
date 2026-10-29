import { test } from 'node:test';
import assert from 'node:assert/strict';
import { goBackOr } from './back-nav';

test('a screen with history behind it goes back, keeping the entry it came from', () => {
  const calls: string[] = [];
  goBackOr(() => calls.push('push:/invoices'), 4, () => calls.push('back'));
  assert.deepEqual(calls, ['back']);
});

test('a cold start falls back to the parent route', () => {
  const calls: string[] = [];
  goBackOr(() => calls.push('push:/invoices'), 1, () => calls.push('back'));
  assert.deepEqual(calls, ['push:/invoices']);
});

test('a zero history length also falls back (SSR / no window)', () => {
  const calls: string[] = [];
  goBackOr(() => calls.push('push:/settings'), 0, () => calls.push('back'));
  assert.deepEqual(calls, ['push:/settings']);
});
