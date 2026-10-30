// Bank tracking, phase 1: model + local-only guarantee.
//
// Two jobs:
//  1. Prove the review stack's queue, counter and red-dot rules.
//  2. Prove no bank screen can reach a database write. The check is structural
//     on purpose: the components never import the Supabase client, so there is
//     no write to stub. If someone adds one, this test fails before the build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  BANK_ITEMS, bankReducer, booksDotVisible, counterLabel, dateOptions, formatDay,
  formatMoney, hiddenCount, hiddenQueue, nextQueueIndex, pendingCount, reviewQueue,
  rubberBand, seedReviewState, statusOf, swipeTransform, unaccountedCount,
} from './bank-tracking';

test('fixture seeds a full copy: edits never touch the exported items', () => {
  const state = seedReviewState();
  assert.equal(state.items.length, BANK_ITEMS.length);
  const first = state.items[0];
  const patched = bankReducer(state, { type: 'edit', id: first.id, patch: { amount: 1, date: '2026-01-01' } });
  assert.equal(patched.items[0].amount, 1);
  assert.notEqual(BANK_ITEMS[0].amount, 1);
  assert.equal(BANK_ITEMS[0].date, '2026-10-28');
});

test('queue only holds open items, in fixture order', () => {
  let state = seedReviewState();
  assert.equal(reviewQueue(state).length, BANK_ITEMS.length);
  state = bankReducer(state, { type: 'add', id: 'wm-1028' });
  assert.equal(reviewQueue(state).length, BANK_ITEMS.length - 1);
  assert.equal(statusOf(state, 'wm-1028'), 'added');
  assert.equal(reviewQueue(state).some((it) => it.id === 'wm-1028'), false);
});

test('hidden items leave the stack but stay unaccounted for', () => {
  let state = seedReviewState();
  const total = state.items.length;
  state = bankReducer(state, { type: 'hide', id: 'wm-1028' });
  assert.equal(pendingCount(state), total - 1);
  assert.equal(hiddenCount(state), 1);
  assert.equal(hiddenQueue(state)[0].id, 'wm-1028');
  // The dot rule counts unaccounted + hidden, so hiding keeps it lit.
  assert.equal(unaccountedCount(state), total);
  assert.equal(booksDotVisible(state), true);
});

test('reviewing everything clears the dot; opening or filtering never does', () => {
  let state = seedReviewState();
  const before = unaccountedCount(state);
  state = bankReducer(state, { type: 'filter', filter: 'hidden' });
  assert.equal(unaccountedCount(state), before, 'switching filter changes nothing');
  state = bankReducer(state, { type: 'filter', filter: 'review' });

  // Every action that decides an item.
  state = bankReducer(state, { type: 'ignore', id: BANK_ITEMS[0].id });
  state = bankReducer(state, { type: 'already', id: BANK_ITEMS[1].id });
  assert.equal(booksDotVisible(state), true);
  for (const item of state.items) state = bankReducer(state, { type: 'add', id: item.id });
  assert.equal(pendingCount(state), 0);
  assert.equal(hiddenCount(state), 0);
  assert.equal(booksDotVisible(state), false);
});

test('hiding keeps the item recoverable: unhide puts it back in the stack', () => {
  let state = seedReviewState();
  state = bankReducer(state, { type: 'hide', id: 'co-1027' });
  assert.equal(reviewQueue(state).some((it) => it.id === 'co-1027'), false);
  state = bankReducer(state, { type: 'unhide', id: 'co-1027' });
  const queue = reviewQueue(state);
  assert.equal(queue.some((it) => it.id === 'co-1027'), true);
  assert.equal(queue[1].id, 'co-1027', 'returns to its fixture position');
  assert.equal(hiddenCount(state), 0);
});

test('counter reads "3 of 7" and the queue never wraps', () => {
  assert.equal(counterLabel(3, 7), '3 of 7');
  assert.equal(counterLabel(1, 1), '1 of 1');
  assert.equal(nextQueueIndex(5, 0, -1), 0);
  assert.equal(nextQueueIndex(5, 4, 1), 4);
  assert.equal(nextQueueIndex(5, 2, 1), 3);
  assert.equal(nextQueueIndex(0, 0, 1), 0);
});

test('swipe: 80px commits, rubber bands at the ends, rotates dx/26', () => {
  assert.equal(rubberBand(42, false), 42);
  const edge = rubberBand(100, true);
  assert.ok(edge > 0 && edge < 100, 'compressed past the first card');
  assert.ok(rubberBand(-100, true) < 0, 'keeps the sign at the last card');
  assert.equal(swipeTransform(0, true), undefined, 'reduced motion does not move');
  assert.match(String(swipeTransform(26)), /rotate\(1\.00deg\)/);
});

test('dates and money match the card copy', () => {
  assert.equal(formatDay('2026-10-06'), 'Oct 6');
  assert.equal(formatMoney(1150), '$1,150.00');
  const options = dateOptions('2026-10-28', '2026-10-30');
  assert.deepEqual(options.map((o) => o.value), ['2026-10-28', '2026-10-27', '2026-10-30']);
  assert.equal(options[2].label, 'Oct 30 · Today');
  // A charge that already is today's date is not offered twice.
  assert.equal(dateOptions('2026-10-30', '2026-10-30').length, 2);
});

// ── The local-only guarantee ──
const ROOT = process.cwd();
const BANK_GLOBALS = join(ROOT, 'src', 'app', 'globals.css');

function bankSources(): string[] {
  const dir = join(ROOT, 'src', 'components', 'bank');
  const components = readdirSync(dir)
    .filter((f) => /\.(tsx?|jsx?)$/.test(f) && !f.endsWith('.test.ts'))
    .map((f) => join(dir, f));
  return [...components, join(ROOT, 'src', 'lib', 'bank-tracking.ts')];
}

test('no bank component can reach a database write', () => {
  const forbidden: [RegExp, string][] = [
    [/from\s+['"][^'"]*supabase[^'"]*['"]/, 'imports the Supabase client'],
    [/createClient\s*\(/, 'creates a Supabase client'],
    [/\.insert\s*\(/, 'calls insert()'],
    [/\.update\s*\(/, 'calls update()'],
    [/\.upsert\s*\(/, 'calls upsert()'],
    [/\.delete\s*\(/, 'calls delete()'],
    [/\.rpc\s*\(/, 'calls rpc()'],
    [/fetch\s*\(\s*['"`]\/?api\//, 'calls an API route'],
    [/\bXMLHttpRequest\b|\bsendBeacon\b/, 'sends a request'],
  ];
  const files = bankSources();
  assert.ok(files.length >= 4, 'the bank files are where the test expects them');
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const [pattern, what] of forbidden) {
      assert.doesNotMatch(source, pattern, `${file} must not write: it ${what}`);
    }
  }
});

test('the bank screens are flagged, never always-on', () => {
  // The shell only mounts the provider behind the flag prop, and the flag's
  // default is false so a forgotten prop cannot ship the UI.
  const shell = readFileSync(join(ROOT, 'src', 'components', 'app', 'AppShell.tsx'), 'utf8');
  assert.match(shell, /bankTracking = false/);
  assert.match(shell, /<BankTrackingProvider/);
  // The tokens live in globals.css next to the app's own motion system.
  const css = readFileSync(BANK_GLOBALS, 'utf8');
  for (const token of ['--oi-alert', '--oi-money-in', '--oi-stack-peek-1', '--oi-fly', '--oi-snap', '--oi-pop', '--oi-highlight-new']) {
    assert.match(css, new RegExp(token.replace(/-/g, '\\-') + ':'), `${token} is defined`);
  }
});
