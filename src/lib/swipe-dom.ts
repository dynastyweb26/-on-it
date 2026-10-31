// DOM checks shared by the tab deck and the nested back swipe.
// Kept out of the pure swipe math so the thresholds stay unit-testable.

import { backScrollerHolds, type BackTarget } from './back-gesture';

// A vertical scroller reports overflow-x: auto in some browsers. Only treat
// it as a horizontal scroller when the author left overflow-x scrollable and
// the content genuinely overflows. overflow-x: hidden/clip never blocks.
export function blocksTabSwipeFromOverflow(
  overflowX: string,
  scrollWidth: number,
  clientWidth: number,
): boolean {
  return (overflowX === 'auto' || overflowX === 'scroll') && scrollWidth > clientWidth;
}

/**
 * Where a gesture must NOT switch tabs: text entry, anything opting out via
 * data-no-tab-swipe="true" (a SwipeableRow's swipe-to-delete, the chat invoice
 * card), horizontal scrollers, and sheets/modals (fixed layers).
 *
 * data-tab-scroll-owner marks the page's own vertical scroller. It stops the
 * walk before that element's computed overflow-x (which the browser reports as
 * auto whenever overflow-y is auto) can be mistaken for a horizontal scroller.
 */
export function swipeBlockedAt(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  if (target.closest('input, textarea, select, [contenteditable="true"], [data-no-tab-swipe="true"]')) return true;
  let el: Element | null = target;
  while (el && el !== document.body) {
    if (el.hasAttribute('data-tab-scroll-owner')) return false;
    const style = window.getComputedStyle(el);
    if (style.position === 'fixed') return true;
    if (blocksTabSwipeFromOverflow(style.overflowX, el.scrollWidth, el.clientWidth)) return true;
    el = el.parentElement;
  }
  return false;
}

// A text field, as far as the back swipe is concerned: tapping it focuses it
// and dragging inside it moves the caret, but a sideways drag across it does
// not — so it is only a reason to refuse when something is selected.
const TEXT_ENTRY = 'input, textarea, select, [contenteditable="true"]';
// The drag *is* the control on these, so the gesture is never taken.
const OWN_GESTURE = 'input[type="range"], [data-no-back-swipe="true"], [data-no-tab-swipe="true"]';

/** Whether the text field under the touch currently has a live selection. */
function hasLiveSelection(field: Element): boolean {
  const active = document.activeElement;
  if (!active || (active !== field && !field.contains(active))) return false;
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
    const { selectionStart, selectionEnd } = active;
    return typeof selectionStart === 'number' && typeof selectionEnd === 'number' && selectionEnd > selectionStart;
  }
  return (window.getSelection()?.toString() ?? '') !== '';
}

/**
 * What the element under a back-swipe touch means for that gesture.
 *
 * Decided at the axis lock, not at touchstart (SwipeBack): taps, focus and
 * vertical scrolling must work everywhere, and only a drag that has actually
 * gone sideways can be refused. Deliberately separate from swipeBlockedAt —
 * the deck's tab gesture keeps its own rules, which are stricter.
 */
export function backTargetAt(target: EventTarget | null): BackTarget {
  const none: BackTarget = { textEntry: false, textSelection: false, ownGesture: false, scrollableChild: false };
  if (!(target instanceof Element)) return { ...none, ownGesture: true };

  const field = target.closest(TEXT_ENTRY);
  const result: BackTarget = {
    ...none,
    textEntry: !!field,
    textSelection: field ? hasLiveSelection(field) : false,
    ownGesture: !!target.closest(OWN_GESTURE),
  };
  if (result.ownGesture) return result;

  let el: Element | null = target;
  while (el && el !== document.body) {
    // The page's own vertical scroller: its overflow-x is not a rail.
    if (el.hasAttribute('data-tab-scroll-owner')) break;
    const style = window.getComputedStyle(el);
    // Sheets and modals: their own surface, not a page to swipe away.
    if (style.position === 'fixed') return { ...result, ownGesture: true };
    // A rail only holds the swipe while it can still scroll in this direction.
    if (
      blocksTabSwipeFromOverflow(style.overflowX, el.scrollWidth, el.clientWidth) &&
      backScrollerHolds(el.scrollLeft)
    ) return { ...result, scrollableChild: true };
    el = el.parentElement;
  }
  return result;
}

/**
 * Swallow the one synthetic click a touch swipe leaves behind. Only called
 * once a gesture has actually moved, so a tap, a focus or a link tap is never
 * affected — and the window is short, so an intentional follow-up tap lands.
 */
export function suppressNextClick(): void {
  // The synthetic click lands immediately after touchend; keep the window
  // short so an intentional follow-up tap is not swallowed.
  const until = Date.now() + 350;
  const handler = (ev: MouseEvent) => {
    if (Date.now() > until) { cleanup(); return; }
    ev.preventDefault();
    ev.stopPropagation();
    cleanup();
  };
  const cleanup = () => document.removeEventListener('click', handler, true);
  document.addEventListener('click', handler, true);
  window.setTimeout(cleanup, 400);
}
