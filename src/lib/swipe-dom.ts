// DOM checks shared by the tab deck and the old nested-route swipe handler.
// Kept out of the pure swipe math so the thresholds stay unit-testable.

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
