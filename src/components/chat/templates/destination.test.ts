import test from 'node:test';
import assert from 'node:assert/strict';
import { openDestination } from './destination';

test('a declared in-app path opens through the router', () => {
  const pushed: string[] = [];
  const open = openDestination('/invoices?filter=unpaid', (p) => pushed.push(p));
  assert.ok(open);
  open!();
  assert.deepEqual(pushed, ['/invoices?filter=unpaid']);
});

test('no destination, or one that leaves the app, gives no handler', () => {
  for (const p of [undefined, '', 'invoices', '//evil.example', 'https://evil.example']) {
    assert.equal(openDestination(p, () => {}), undefined, String(p));
  }
});
