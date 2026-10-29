// Why Pending jumped and Signed did not, and what the restore does about it.
//
// Rows carry `content-visibility: auto` with `contain-intrinsic-size: 88px`
// (globals.css `.onit-row-cv`) while a real row measures ~105px. Until a row is
// painted the container's height is the 88px ESTIMATE, so the reachable maximum
// is short of the saved offset. A reader who works down a long Pending list is
// near its end; 22 rows down, the saved 2310px exceeded the 1840px the estimate
// allowed, the old restore refused to write a target it could not reach, and it
// gave up at the top. Signed lists are tapped mid-list, where the offset is
// under the estimate, which is why they restored.
//
// The fix writes the best reachable position every frame (never treating a clamp
// as arrival) and anchors to the ROW at the top, so painting rows grows the
// maximum until the anchored row is back under the fold.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  anchorAt, anchorOffset, clearSavedScroll, readSavedAnchor, readSavedScroll,
  restoreScrollTop, saveScroll, tabScrollKey, type RowRect,
} from './tab-scroll';

const TAB = 1;
const REAL_ROW = 105;
const INTRINSIC_ROW = 88;
const VIEWPORT = 800;

/** A scroller that reports row heights as 88px until a row has been painted. */
function list(rows: number) {
  const painted = new Set<number>();
  let top = 0;

  const heights = () => Array.from({ length: rows }, (_, i) => (painted.has(i) ? REAL_ROW : INTRINSIC_ROW));
  const tops = () => {
    let y = 0;
    return heights().map((h) => { const r = { top: y }; y += h; return r; });
  };
  const scrollHeight = () => heights().reduce((a, b) => a + b, 0);

  const el = {
    get scrollHeight() { return scrollHeight(); },
    clientHeight: VIEWPORT,
    _top: 0,
    get scrollTop() { return this._top; },
    set scrollTop(v: number) {
      this._top = Math.max(0, Math.min(v, Math.max(0, scrollHeight() - VIEWPORT)));
      // Painting: anything within a screen of the fold measures for real.
      tops().forEach((r, i) => {
        if (r.top + INTRINSIC_ROW > this._top - VIEWPORT && r.top < this._top + 2 * VIEWPORT) painted.add(i);
      });
    },
    rects(): RowRect[] {
      return tops().map((r, i) => ({ id: `r${i}`, top: r.top }));
    },
  };
  return el;
}

function driver() {
  let t = 0;
  const queue: (() => void)[] = [];
  return {
    now: () => t,
    raf: (cb: () => void) => { queue.push(cb); return queue.length; },
    cancel: () => {},
    /** Run frames until the restore stops or we run out of patience. */
    settle(maxFrames = 40) {
      for (let i = 0; i < maxFrames; i += 1) {
        t += 16;
        const due = queue.splice(0, queue.length);
        if (due.length === 0) return;
        due.forEach((cb) => cb());
      }
    },
  };
}

test('pending near the end: the anchored row comes back under the fold', () => {
  clearSavedScroll();
  const key = tabScrollKey(TAB, '?filter=pending');
  const el = list(30);

  // The reader worked 22 rows down. Those rows were painted while they looked
  // at them, so the position they left is real geometry (22 × 105 = 2310) and
  // the row under the fold is r22. The returning list starts from the 88px
  // estimate, which is what made the offset unreachable.
  const savedTop = 22 * REAL_ROW;
  const paintedWhileReading: RowRect[] = Array.from({ length: 30 }, (_, i) => ({ id: `r${i}`, top: i * REAL_ROW }));
  const anchor = anchorAt(paintedWhileReading, savedTop);
  assert.deepEqual(anchor, { id: 'r22', delta: 0 });
  saveScroll(key, savedTop, anchor);

  const d = driver();
  restoreScrollTop(el, () => {
    const at = anchorOffset(el.rects(), readSavedAnchor(key)!);
    return at ?? readSavedScroll(key);
  }, d);
  d.settle();

  // The contract is the ROW, not the pixel. Rows above r22 are never painted on
  // the way back, so they keep their 88px estimate and the absolute offset can
  // never equal 2310 again; what matters is that r22 is the row under the fold.
  const rowAtFold = el.rects().find((r) => r.id === 'r22')!.top;
  assert.ok(rowAtFold > 0, `key ${key}: the list is not at the top`);
  assert.equal(
    el.scrollTop, rowAtFold,
    `key ${key}: r22 should sit at the fold (saved ${savedTop}px; estimate-only maximum was ${30 * INTRINSIC_ROW - VIEWPORT}px, which the old restore refused)`,
  );
});

test('signed mid-list: an offset under the estimate restores without any painting', () => {
  clearSavedScroll();
  const key = tabScrollKey(TAB, '?filter=signed');
  const el = list(30);
  const savedTop = 400;
  saveScroll(key, savedTop, anchorAt(el.rects(), savedTop));
  const d = driver();
  restoreScrollTop(el, readSavedScroll(key), d);
  d.settle();
  assert.equal(el.scrollTop, savedTop, `key ${key}`);
});

test('a skeleton (no rows yet) is never mistaken for an arrival at the top', () => {
  clearSavedScroll();
  const key = tabScrollKey(TAB, '?filter=pending');
  saveScroll(key, 2310, null);
  const el = { scrollHeight: 900, clientHeight: VIEWPORT, scrollTop: 0 };
  const d = driver();
  let done = false;
  restoreScrollTop(el, 2310, { ...d, onDone: () => { done = true; } });
  d.settle(3);
  assert.equal(el.scrollTop, 100, 'clamped to what exists, not called arrived');
  assert.equal(done, false, 'still waiting for the list to grow');
});

test('anchorAt picks the first row at or below the fold', () => {
  const rects: RowRect[] = [
    { id: 'a', top: 0 }, { id: 'b', top: 100 }, { id: 'c', top: 200 },
  ];
  assert.deepEqual(anchorAt(rects, 120), { id: 'c', delta: 80 });
  assert.deepEqual(anchorAt(rects, 0), { id: 'a', delta: 0 });
  assert.deepEqual(anchorAt(rects, 999), { id: 'c', delta: -799 });
  assert.equal(anchorAt([], 10), null);
});

test('anchorOffset follows the row when rows above it change height', () => {
  const anchor = { id: 'c', delta: 0 };
  assert.equal(anchorOffset([{ id: 'a', top: 0 }, { id: 'b', top: 120 }, { id: 'c', top: 260 }], anchor), 260);
  assert.equal(anchorOffset([{ id: 'a', top: 0 }], anchor), null, 'deleted row: caller falls back');
});
