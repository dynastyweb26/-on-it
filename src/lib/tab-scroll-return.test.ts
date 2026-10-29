// Reproduces "back from an estimate lands at the top" for each real exit.
//
// The session being modelled:
//   1. the reader is on Invoices → Estimates (filter 'pending') and scrolls deep
//   2. they open a row: the deck unmounts, the scroll owner (TabScroller) saves
//   3. they come back, and a fresh TabScroller mounts and restores
//
// The exits differ in the URL they come back to:
//   - the app's Back arrow pushes '/invoices' with the query dropped
//   - a phone swipe-back / browser back returns to '/invoices?filter=pending'
//   - converting an estimate pushes a new document URL, then Back goes home
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tabIndexOf } from './tabs';
import {
  clearSavedScroll, readSavedScroll, registerTabFilter, restoreScrollTop, saveScroll, tabScrollKey,
} from './tab-scroll';

const TAB = tabIndexOf('/invoices');
const LIST_SEARCH = '?filter=pending';
const DEEP = 1600;

function box(scrollHeight: number, clientHeight = 800) {
  return {
    scrollHeight,
    clientHeight,
    _top: 0,
    get scrollTop() { return this._top; },
    set scrollTop(v: number) { this._top = Math.max(0, Math.min(v, Math.max(0, this.scrollHeight - this.clientHeight))); },
  };
}

function driver() {
  const queue: (() => void)[] = [];
  return {
    now: () => 0,
    raf: (cb: () => void) => { queue.push(cb); return queue.length; },
    cancel: () => {},
    flush: () => { queue.splice(0, queue.length).forEach((cb) => cb()); },
  };
}

type Exit = 'back-arrow' | 'browser-back' | 'convert-then-back';

function returnKey(exit: Exit): string {
  // The Back arrow pushes the parent route without the query; a browser back
  // returns to the entry that still has it; a convert leaves for a new document
  // and the Back arrow from there also drops the query.
  const returnSearch = exit === 'browser-back' ? LIST_SEARCH : '';
  return tabScrollKey(TAB, returnSearch);
}

function session(exit: Exit) {
  clearSavedScroll();
  // What InvoicesView does on render: the deck's memory follows the list on
  // screen, so an exit that drops ?filter= still lands in the same bucket.
  registerTabFilter(TAB, 'pending');
  const savedKey = tabScrollKey(TAB, LIST_SEARCH);
  saveScroll(savedKey, DEEP); // the reader's deep offset, at the moment they tap in

  const key = returnKey(exit);
  const target = readSavedScroll(key);
  const el = box(5000);
  const d = driver();
  restoreScrollTop(el, target, d);
  d.flush();
  return { savedKey, key, target, restored: el.scrollTop };
}

for (const exit of ['browser-back', 'back-arrow', 'convert-then-back'] as Exit[]) {
  test(`${exit}: the list comes back at the offset it was left at`, () => {
    const r = session(exit);
    assert.equal(
      r.restored, DEEP,
      `${exit}: saved ${r.savedKey}=${DEEP}, but restored from ${r.key}=${r.target}`,
    );
  });
}
