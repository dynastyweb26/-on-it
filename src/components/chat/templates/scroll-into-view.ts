// The smallest scroll that brings a box fully into its scroller's viewport: positive
// scrolls down, negative up, 0 when it already fits (or is taller than the viewport and
// already covers it). Pure, so it is unit-tested; the thread applies it to the list's own
// scrollTop, never scrollIntoView (that also scrolls the page, and a smooth scroll makes
// iOS swallow the next tap).
export function smallestScroll(list: { top: number; bottom: number }, box: { top: number; bottom: number }): number {
  const below = box.bottom - list.bottom;
  const above = list.top - box.top;
  if (box.bottom - box.top > list.bottom - list.top) return box.top < list.top ? -above : 0; // taller than the view: show its top
  if (below > 0) return below;
  if (above > 0) return -above;
  return 0;
}
