// Reproduces the "open a document, go back, the list is at the top" bug at the
// mechanism level, without a browser: a scroller that is short when it mounts
// (skeleton, or rows still loading) and grows when the data lands.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TAB_SCROLL_MAX_MS,
  clearSavedScroll,
  maxScroll,
  readSavedScroll,
  registerTabFilter,
  restoreScrollTop,
  routeScrollKey,
  saveScroll,
  tabScrollKey,
} from './tab-scroll';

/** A fake scroller: scrollTop clamps to the scrollable range, like a real one. */
function box(scrollHeight: number, clientHeight = 800) {
  const el = {
    scrollHeight,
    clientHeight,
    _top: 0,
    get scrollTop() { return this._top; },
    set scrollTop(v: number) { this._top = Math.max(0, Math.min(v, Math.max(0, this.scrollHeight - this.clientHeight))); },
  };
  return el;
}

/** Manual clock + rAF queue, so a "two seconds later" data arrival is instant. */
function driver() {
  let time = 0;
  const queue: (() => void)[] = [];
  const deps = {
    now: () => time,
    raf: (cb: () => void) => { queue.push(cb); return queue.length; },
    cancel: () => {},
  };
  return {
    deps,
    advance(ms: number) {
      time += ms;
      const due = queue.splice(0, queue.length);
      due.forEach((cb) => cb());
    },
    run(frameMs = 16, frames = 1) {
      for (let i = 0; i < frames; i += 1) this.advance(frameMs);
    },
  };
}

test('restores immediately when the content is already tall', () => {
  const el = box(5000);
  const d = driver();
  restoreScrollTop(el, 2000, d.deps);
  assert.equal(el.scrollTop, 2000);
});

test('waits for content that arrives late instead of stopping at the top', () => {
  const el = box(400); // skeleton: nothing to scroll yet
  const d = driver();
  let done = false;
  restoreScrollTop(el, 2000, { ...d.deps, onDone: () => { done = true; } });

  d.run(16, 60); // ~1s of frames while still short
  assert.equal(el.scrollTop, 0, 'never clamped to 0 as if it had arrived');
  assert.equal(done, false, 'still waiting');

  el.scrollHeight = 5000; // the cached rows / fetch land
  d.run(16, 2);
  assert.equal(el.scrollTop, 2000);
  assert.equal(done, true);
});

test('gives up after the window when the content never grows', () => {
  const el = box(400);
  const d = driver();
  let done = false;
  restoreScrollTop(el, 2000, { ...d.deps, onDone: () => { done = true; } });
  d.run(100, Math.ceil(TAB_SCROLL_MAX_MS / 100) + 3);
  assert.equal(done, true);
  assert.equal(el.scrollTop, 0);
});

test('a touch or wheel stops the restore so it never fights the user', () => {
  const el = box(400);
  const d = driver();
  let taken = false;
  restoreScrollTop(el, 2000, { ...d.deps, cancelled: () => taken });
  d.run(16, 3);
  taken = true;
  el.scrollHeight = 5000;
  d.run(16, 3);
  assert.equal(el.scrollTop, 0, 'did not yank the list back');
});

test('positions are per tab and per filter, and survive a remount', () => {
  clearSavedScroll();
  saveScroll(tabScrollKey(1, '?filter=open'), 1200);
  saveScroll(tabScrollKey(1, '?filter=paid'), 3000);
  saveScroll(tabScrollKey(0, ''), 90);

  assert.equal(readSavedScroll(tabScrollKey(1, '?filter=open')), 1200);
  assert.equal(readSavedScroll(tabScrollKey(1, '?filter=paid')), 3000);
  assert.equal(readSavedScroll(tabScrollKey(1, '?filter=pending')), 0, 'a filter never visited starts at the top');
  assert.equal(readSavedScroll(tabScrollKey(2, '?filter=open')), 0, 'another tab is a different bucket');
  assert.equal(readSavedScroll(routeScrollKey('/expenses')), 0);
});

test('the rendered filter outranks a query string that lost it', () => {
  clearSavedScroll();
  registerTabFilter(1, 'pending');
  assert.equal(tabScrollKey(1, ''), '1:pending', 'Back arrow returns to /invoices with no query');
  assert.equal(tabScrollKey(1, '?filter=open'), '1:pending', 'the list on screen wins');
  clearSavedScroll(); // forgets the registered filter too
  assert.equal(tabScrollKey(1, '?filter=open'), '1:open');
});

test('a malformed query string never throws and keys stably', () => {
  // URLSearchParams tolerates a broken escape; the point is that the key is
  // still produced (no crash on the way back into a tab) and is stable.
  const a = tabScrollKey(1, '?filter=%E0%A4%A');
  const b = tabScrollKey(1, '?filter=%E0%A4%A');
  assert.equal(a, b);
  assert.ok(a.startsWith('1:'));
});

test('maxScroll never goes negative', () => {
  assert.equal(maxScroll({ scrollTop: 0, scrollHeight: 100, clientHeight: 800 }), 0);
  assert.equal(maxScroll({ scrollTop: 0, scrollHeight: 5000, clientHeight: 800 }), 4200);
});
