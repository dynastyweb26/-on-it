// Toast behaviour as numbers and decisions (alive layer 01). The component only
// draws what these say. Every figure is from the design's motion spec.
import type { EventTone } from './events';

export const TOAST_MAX = 3;
export const ENTER_MS = 380;
export const EXIT_MS = 220;
export const EXPAND_MS = 280;
export const STAGGER_MS = 80;
export const SWIPE_DISMISS_PX = 32;
export const SWIPE_CLEAR_PX = 96;
export const FLICK_PX_PER_MS = 0.5; // 500px/s

/** 8s when the toast has an action (signed) or is overdue, 5s money, 4s views. */
export function dwellMs(kind: string, tone: EventTone, hasAction: boolean): number {
  if (hasAction || kind === 'invoice_overdue') return 8000;
  if (tone === 'gold' || tone === 'success') return 5000;
  return 4000;
}

export type SwipeOutcome = 'none' | 'dismiss' | 'clear';

/** dy is the finger's travel (negative = up); ms the gesture's duration. */
export function swipeOutcome(dy: number, ms: number): SwipeOutcome {
  if (dy <= -SWIPE_CLEAR_PX) return 'clear';
  const v = dy / Math.max(1, ms);
  if (dy <= -SWIPE_DISMISS_PX || v <= -FLICK_PX_PER_MS) return 'dismiss';
  return 'none';
}

/** Back cards: depth 1 and 2 step back (scale, y, opacity). Depth 0 is the front. */
export function stackStep(depth: number): { scale: number; y: number; opacity: number } {
  if (depth <= 0) return { scale: 1, y: 0, opacity: 1 };
  if (depth === 1) return { scale: 0.94, y: 12, opacity: 0.9 };
  return { scale: 0.88, y: 22, opacity: 0.75 };
}

/** Append unseen ids, newest last, never more than the cap (oldest drops). */
export function enqueueIds<T extends { id: string }>(queue: T[], rows: T[]): T[] {
  const known = new Set(queue.map((q) => q.id));
  return [...queue, ...rows.filter((r) => !known.has(r.id))].slice(-TOAST_MAX);
}
