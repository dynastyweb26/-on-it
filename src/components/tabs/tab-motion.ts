// Tab motion timing and a one-shot marker for "this navigation came from a
// drag". The shell uses the marker to suppress the old icon bounce; the deck
// itself owns the page and pill motion.

export const COMMIT_MS = 340;
export const COMMIT_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
export const SPRING_EASE = 'cubic-bezier(0.25, 1, 0.5, 1)';

let gestureNavAt = 0;

/** Called at the instant a drag commits a tab change. */
export function markTabGestureNavigation(): void {
  gestureNavAt = Date.now();
}

/** True once for a nearby path change caused by a drag. */
export function takeTabGestureNavigation(): boolean {
  if (!gestureNavAt) return false;
  const recent = Date.now() - gestureNavAt < 1000;
  gestureNavAt = 0;
  return recent;
}
