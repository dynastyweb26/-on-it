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
  BANK_ITEMS, addedToast, bankActive, bankReducer, booksDotVisible, counterLabel, dateOptions, formatDay,
  formatMoney, ignoredCount, ignoredQueue, nextQueueIndex, pendingCount, reviewQueue, rubberBand,
  seedReviewState, statusOf, swipeTransform, unaccountedCount, unaccountedItems,
} from './bank-tracking';
import { bankTrackingForEnv } from './feature-flags';

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

// CHANGES.md · item 1: the per-card X is gone, so there is no hidden state.
// Closing the sheet keeps every unresolved item open and unaccounted for.
test('closing the stack never decides an item: unresolved cards stay open', () => {
  const state = seedReviewState();
  assert.equal(unaccountedCount(state), BANK_ITEMS.length);
  assert.equal(booksDotVisible(state), true);
  const statuses = new Set(Object.values(state.status));
  assert.equal(statuses.has('hidden' as never), false);
  assert.equal(reviewQueue(state).length, unaccountedItems(state).length);
});

test('reviewing everything clears the dot; opening never does', () => {
  let state = seedReviewState();
  const before = unaccountedCount(state);
  assert.equal(before, BANK_ITEMS.length, 'nothing hides from the counter');

  state = bankReducer(state, { type: 'ignore', id: BANK_ITEMS[0].id });
  state = bankReducer(state, { type: 'already', id: BANK_ITEMS[1].id });
  assert.equal(booksDotVisible(state), true);
  for (const item of state.items) state = bankReducer(state, { type: 'add', id: item.id });
  assert.equal(pendingCount(state), 0);
  assert.equal(booksDotVisible(state), false);
});

// CHANGES.md · item 2: hidden becomes Ignored — restorable, and counted by
// nothing but its own tab.
test('don\'t add moves a card to Ignored, which counts toward no dot', () => {
  let state = seedReviewState();
  const before = unaccountedCount(state);
  state = bankReducer(state, { type: 'ignore', id: 'lo-1026' });
  assert.equal(pendingCount(state), before - 1);
  assert.equal(ignoredCount(state), 1);
  assert.equal(ignoredQueue(state)[0].id, 'lo-1026');
  assert.equal(unaccountedCount(state), before - 1, 'ignored is not unaccounted');
  assert.equal(unaccountedItems(state).some((it) => it.id === 'lo-1026'), false);
});

test('restore puts an ignored card back into To review at its position', () => {
  let state = seedReviewState();
  state = bankReducer(state, { type: 'ignore', id: 'co-1027' });
  state = bankReducer(state, { type: 'filter', filter: 'ignored' });
  state = bankReducer(state, { type: 'restore', id: 'co-1027' });
  assert.equal(ignoredCount(state), 0);
  assert.equal(statusOf(state, 'co-1027'), 'open');
  assert.equal(reviewQueue(state)[1].id, 'co-1027');
});

test('ignored items only become final when the stack closes with To review empty', () => {
  let state = seedReviewState();
  state = bankReducer(state, { type: 'ignore', id: 'wm-1028' });
  // Still cards waiting: closing changes nothing, Ignored persists.
  const kept = bankReducer(state, { type: 'finalizeIgnored' });
  assert.equal(ignoredCount(kept), 1);
  assert.equal(statusOf(kept, 'wm-1028'), 'ignored');
  // Nothing left to review: ignored becomes final and the tab goes away.
  for (const item of state.items) {
    if (statusOf(state, item.id) === 'open') state = bankReducer(state, { type: 'add', id: item.id });
  }
  assert.equal(pendingCount(state), 0);
  const closed = bankReducer(state, { type: 'finalizeIgnored' });
  assert.equal(ignoredCount(closed), 0);
  assert.equal(statusOf(closed, 'wm-1028'), 'dropped');
  assert.equal(closed.filter, 'review');
});

test('unlink (reopen) sends a bank-verified item back to Unaccounted for', () => {
  let state = seedReviewState();
  state = bankReducer(state, { type: 'add', id: 'lo-1026' });
  assert.equal(statusOf(state, 'lo-1026'), 'added');
  assert.equal(unaccountedItems(state).some((it) => it.id === 'lo-1026'), false);
  state = bankReducer(state, { type: 'reopen', id: 'lo-1026' });
  assert.equal(statusOf(state, 'lo-1026'), 'open');
  assert.equal(unaccountedItems(state).some((it) => it.id === 'lo-1026'), true);
  assert.equal(booksDotVisible(state), true);
});

test('unaccounted amount sums only what the owner still has to deal with', () => {
  let state = seedReviewState();
  const total = state.items.reduce((sum, it) => sum + it.amount, 0);
  assert.equal(unaccountedItems(state).length, state.items.length);
  state = bankReducer(state, { type: 'add', id: 'co-1027' });
  const expected = Math.round((total - 432.98) * 100) / 100;
  const actual = Math.round(unaccountedItems(state).reduce((sum, it) => sum + it.amount, 0) * 100) / 100;
  assert.equal(actual, expected);
});

test('the add toast names the day and never an amount', () => {
  assert.equal(addedToast('2026-10-06'), 'Added to Oct 6, totals updated.');
  assert.doesNotMatch(addedToast('2026-10-06'), /\$/);
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

test('the bank feature stays inert until someone is signed in', () => {
  assert.equal(bankActive(true, true), true);
  assert.equal(bankActive(true, false), false, 'flag on, no session');
  assert.equal(bankActive(false, true), false, 'flag off, session');
  assert.equal(bankActive(false, false), false, 'flag off, no session');
});

// ── The local-only guarantee ──
const ROOT = process.cwd();
const BANK_GLOBALS = join(ROOT, 'src', 'app', 'globals.css');

function bankSources(): string[] {
  const dir = join(ROOT, 'src', 'components', 'bank');
  const components = readdirSync(dir)
    .filter((f) => /\.(tsx?|jsx?)$/.test(f) && !f.endsWith('.test.ts'))
    .map((f) => join(dir, f));
  return [
    ...components,
    join(ROOT, 'src', 'lib', 'bank-tracking.ts'),
    join(ROOT, 'src', 'lib', 'bank-accounts.ts'),
  ];
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
  // The shell mounts the provider behind the flag the server reads, and the
  // provider's own default is false so a forgotten prop cannot ship the UI.
  const layout = readFileSync(join(ROOT, 'src', 'app', '(app)', 'layout.tsx'), 'utf8');
  assert.match(layout, /<BankTrackingProvider enabled=\{bankTrackingForEnv\(process\.env\.VERCEL_ENV\)\}>/);
  const provider = readFileSync(join(ROOT, 'src', 'components', 'bank', 'BankTrackingProvider.tsx'), 'utf8');
  assert.match(provider, /enabled = false/);
  // The flag itself fails closed: only a Vercel preview build shows the screens.
  assert.equal(bankTrackingForEnv('preview'), true);
  for (const env of ['production', 'development', undefined, '']) {
    assert.equal(bankTrackingForEnv(env), false, `VERCEL_ENV=${String(env)} must stay dark`);
  }
  // The tokens live in globals.css next to the app's own motion system.
  const css = readFileSync(BANK_GLOBALS, 'utf8');
  for (const token of ['--oi-alert', '--oi-money-in', '--oi-stack-peek-1', '--oi-fly', '--oi-snap', '--oi-pop', '--oi-highlight-new']) {
    assert.match(css, new RegExp(token.replace(/-/g, '\\-') + ':'), `${token} is defined`);
  }
});
