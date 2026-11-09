// The toast host was imported by AppShell but never rendered, so no event ever
// toasted (cards still arrived through the thread). AppShell is the one place
// every signed-in screen, Chat included, passes through: it must render the host.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const shell = readFileSync('src/components/app/AppShell.tsx', 'utf8');
const host = readFileSync('src/components/events/EventToastHost.tsx', 'utf8');
const layout = readFileSync('src/app/(app)/layout.tsx', 'utf8');

test('AppShell renders <EventToastHost /> (an import alone mounts nothing)', () => {
  assert.match(shell, /import EventToastHost from '@\/components\/events\/EventToastHost'/);
  assert.match(shell, /<EventToastHost\s*\/>/);
});

test('the host is mounted outside the tab deck, so a tab change never unmounts it', () => {
  const at = shell.indexOf('<EventToastHost');
  assert.ok(at > shell.indexOf('<RecapProvider') && at > shell.indexOf('</RecapProvider>'), 'after the provider closes');
});

test('the signed-in layout wraps its pages in AppShell', () => {
  assert.match(layout, /<AppShell[\s>]/);
});

test('the host overlays: fixed, above the tab bar, inside the safe area', () => {
  assert.match(host, /position: 'fixed'/);
  assert.match(host, /env\(safe-area-inset-top/);
  assert.match(host, /zIndex: TOAST_Z/);
});
