// Scroll memory for the tab deck and the nested-route scroller.
//
// Three jobs, all pure so they can be tested without a browser:
//   - positions live here, keyed per tab AND per list, and survive a remount
//     (the deck unmounts when a nested route opens);
//   - the position is anchored to a ROW (its id plus the offset from the
//     viewport top), not just a pixel count, because a raw offset goes stale the
//     moment the list's geometry differs — rows measure ~105px but the list's
//     `contain-intrinsic-size` estimate is 88px, so a deep offset in a long list
//     can exceed what the container can reach at all. The anchor is resolved
//     against measured rows, so it survives that;
//   - `restoreScrollTop` puts the list back once it can hold the position,
//     stopping when it lands (twice, so a re-measure settles), when the user
//     touches or wheels, or at the safety cap.

/** The bit of a scrolling element these helpers need (a DOM node satisfies it). */
export interface ScrollBox {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

/** A row in the list, measured from the top of the scroll content. */
export interface RowRect {
  id: string;
  top: number;
}

/** The row at the top of the viewport, plus how far above it the reader was. */
export interface ScrollAnchor {
  id: string;
  /** row.top − scrollTop at the moment it was saved (0 when row-aligned). */
  delta: number;
}

/** How long a restore keeps trying while the list is still being measured. */
export const TAB_SCROLL_MAX_MS = 4000;

const positions = new Map<string, number>();
const anchors = new Map<string, ScrollAnchor>();
/** The list each tab is actually showing (Invoices: 'open' | 'paid' | …). */
const renderedFilters = new Map<number, string>();

/**
 * Tell the memory which list a tab is rendering. The panel calls this on every
 * filter change, so the key follows what is on screen rather than what the URL
 * happens to say — the Back arrow comes home to '/invoices' with no ?filter=.
 */
export function registerTabFilter(index: number, filter: string): void {
  renderedFilters.set(index, filter);
}

/**
 * Key for one tab's scroll position. The filter is part of it, so returning to
 * Open after leaving from Paid does not land at Paid's offset.
 *
 * The rendered filter wins over the query string. If the URL lost the query (a
 * push back to the parent route, a converted estimate), the offset is still
 * filed under the list the reader was actually looking at.
 */
export function tabScrollKey(index: number, search: string): string {
  const registered = renderedFilters.get(index);
  if (registered !== undefined) return `${index}:${registered}`;
  let filter = '';
  try {
    filter = new URLSearchParams(search).get('filter') ?? '';
  } catch {
    // A malformed query string is not worth a crash; the tab still remembers.
  }
  return `${index}:${filter}`;
}

/** Key for a nested route's own scroller (expenses, settings sub-screens). */
export function routeScrollKey(pathname: string): string {
  return `route:${pathname}`;
}

export function readSavedScroll(key: string): number {
  return positions.get(key) ?? 0;
}

export function readSavedAnchor(key: string): ScrollAnchor | null {
  return anchors.get(key) ?? null;
}

export function saveScroll(key: string, top: number, anchor?: ScrollAnchor | null): void {
  if (Number.isFinite(top)) positions.set(key, top);
  if (anchor) anchors.set(key, anchor);
  else anchors.delete(key);
}

/** Forget every saved position and registered filter (tests, full sign-out). */
export function clearSavedScroll(): void {
  positions.clear();
  anchors.clear();
  renderedFilters.clear();
}

export function maxScroll(el: ScrollBox): number {
  return Math.max(0, el.scrollHeight - el.clientHeight);
}

/**
 * The anchor for a viewport at `scrollTop`: the first row starting at or below
 * the fold (or the last row, when the reader is past the end).
 */
export function anchorAt(rects: RowRect[], scrollTop: number): ScrollAnchor | null {
  if (rects.length === 0) return null;
  const below = rects.find((r) => r.top >= scrollTop - 1);
  const row = below ?? rects[rects.length - 1];
  return { id: row.id, delta: row.top - scrollTop };
}

/**
 * Where that anchor sits now, from MEASURED rows. Null when the row is gone
 * (deleted, filtered out, converted) — the caller then falls back to the raw
 * offset rather than guessing.
 */
export function anchorOffset(rects: RowRect[], anchor: ScrollAnchor): number | null {
  const row = rects.find((r) => r.id === anchor.id);
  if (!row) return null;
  return Math.max(0, row.top - anchor.delta);
}

export interface RestoreDeps {
  now: () => number;
  raf: (cb: () => void) => number;
  cancel: (id: number) => void;
  /** True once the user takes over (touch, wheel): stop fighting the finger. */
  cancelled?: () => boolean;
  maxMs?: number;
  /** Called when the restore stops, however it ended. */
  onDone?: () => void;
}

/**
 * Put `el` back at the position `target` resolves to. The resolver is asked on
 * every frame, so an anchor can be re-measured as rows paint; a number works
 * too. Each frame writes the best position the container can hold RIGHT NOW:
 * refusing an out-of-range target deadlocked, because rows only measure for
 * real once they are near the fold, so the reachable maximum grows as the list
 * paints. A clamp is never counted as arrival, so a short skeleton waits.
 */
export function restoreScrollTop(
  el: ScrollBox,
  target: number | (() => number),
  deps: RestoreDeps,
): () => void {
  const resolve = typeof target === 'function' ? target : () => target;
  const maxMs = deps.maxMs ?? TAB_SCROLL_MAX_MS;
  const start = deps.now();
  let rafId = 0;
  let stopped = false;
  let landedFrames = 0;
  let previousWant = -1;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    deps.cancel(rafId);
    deps.onDone?.();
  };

  const tick = () => {
    if (stopped) return;
    if (deps.cancelled?.()) { stop(); return; }
    const want = resolve();
    if (want > 0) el.scrollTop = Math.min(want, maxScroll(el));
    // Arrival means the position matches AND the measurement has stopped
    // moving: writing scrollTop paints rows, which re-measures the anchor and
    // moves the target again. Stopping on the first match left a long list one
    // correction short (2123 of 2310 in the Pending test).
    if (Math.abs(el.scrollTop - want) < 2 && want === previousWant) landedFrames += 1;
    else landedFrames = 0;
    previousWant = want;
    if (landedFrames >= 2 || deps.now() - start > maxMs) { stop(); return; }
    rafId = deps.raf(tick);
  };

  tick();
  return () => { if (!stopped) { stopped = true; deps.cancel(rafId); } };
}
