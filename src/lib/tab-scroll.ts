// Scroll memory for the tab deck and the nested-route scroller.
//
// Two jobs, both pure so they can be tested without a browser:
//   - positions live here, keyed per tab AND per list filter, and survive a
//     remount (the deck unmounts when a nested route opens, so without this the
//     return mounted a fresh panel at the top);
//   - `restoreScrollTop` puts the list back once it is TALL ENOUGH to reach the
//     offset. On return the first paint is a skeleton (or a short cached list),
//     and the real rows can arrive seconds later; a one-shot assignment would
//     clamp to 0 and stay there, which is the "jumps to the top" bug.

/** The bit of a scrolling element these helpers need (a DOM node satisfies it). */
export interface ScrollBox {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

/** How long a restore keeps waiting for content to grow. */
export const TAB_SCROLL_MAX_MS = 4000;

const positions = new Map<string, number>();

/**
 * Key for one tab's scroll position. The filter is part of it, so returning to
 * Open after leaving from Paid does not land at Paid's offset.
 */
export function tabScrollKey(index: number, search: string): string {
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

export function saveScroll(key: string, top: number): void {
  if (Number.isFinite(top)) positions.set(key, top);
}

/** Forget every saved position (tests, and a full sign-out). */
export function clearSavedScroll(): void {
  positions.clear();
}

export function maxScroll(el: ScrollBox): number {
  return Math.max(0, el.scrollHeight - el.clientHeight);
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
 * Put `el` back at `target`, waiting for the content to be tall enough.
 * Returns a cancel function. Nothing is clamped to 0 in the meantime, so a
 * short skeleton never reads as "we arrived".
 */
export function restoreScrollTop(el: ScrollBox, target: number, deps: RestoreDeps): () => void {
  const maxMs = deps.maxMs ?? TAB_SCROLL_MAX_MS;
  const start = deps.now();
  let rafId = 0;
  let stopped = false;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    deps.cancel(rafId);
    deps.onDone?.();
  };

  const tick = () => {
    if (stopped) return;
    if (deps.cancelled?.()) { stop(); return; }
    // Only write once the list can actually reach the offset; writing early
    // would clamp to 0 and, once content grew, look like a finished restore.
    if (target <= maxScroll(el)) el.scrollTop = target;
    if (Math.abs(el.scrollTop - target) < 2 || deps.now() - start > maxMs) { stop(); return; }
    rafId = deps.raf(tick);
  };

  tick();
  return () => { if (!stopped) { stopped = true; deps.cancel(rafId); } };
}
