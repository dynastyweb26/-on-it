// The back swipe on nested routes (MOTION-SPEC §18): the pure half.
//
// A nested route (/settings/<section>, /invoices/<id>, a client, the Vault …)
// is not a tab root, so the deck does not own its gesture. A rightward drag
// there means "go back one level", and it is dragged with the finger exactly
// like a tab drag: same axis lock, same commit rule, same settle bounds.
//
// Nothing here is retuned. Every threshold is imported from lib/swipe.ts, so a
// future deck retune cannot leave the back gesture on different numbers, and
// the deck's comment in MOTION-SPEC §17 stays the single source of truth.
//
// Pure on purpose: the thresholds are unit-tested (back-gesture.test.ts)
// rather than checked on a device. The DOM side — listeners, transform,
// settle — is components/app/SwipeBack.tsx.

import {
  classifyAxis,
  isEdgeBackZone,
  settleDuration,
  tabCommitDirection,
  type GestureAxis,
} from './swipe';
import { exactTabIndex } from './tabs';

/** The parent screen's slide-in, at rest and at its shortest (a fast flick). */
export const BACK_ENTER_MAX_MS = 300;
export const BACK_ENTER_MIN_MS = 180;

/** Release speed (px/ms) that shortens the entrance all the way. */
const BACK_ENTER_SPEED = 1.5;

/**
 * How long the outgoing page may stay held off-screen while the router swaps
 * the route. Long enough for a slow payload, short enough that a navigation
 * that never lands cannot leave a blank screen.
 */
export const BACK_HOLD_MAX_MS = 700;

/** True once the route a committed swipe left is no longer the current one. */
export function backArrived(from: string, current: string): boolean {
  return from !== current;
}

export type BackStartInput = {
  /** The route one level up, or null when this screen has no parent. */
  parent: string | null;
  /** The current pathname. */
  path: string;
  /** Where the touch started, in client pixels. */
  clientX: number;
  /** How many fingers are down; a back swipe is always one. */
  touches: number;
  /** False while a previous navigation is still landing (NAV_GUARD_MS). */
  guardOpen: boolean;
  /** swipeBlockedAt(target): text entry, sheets, swipers, h-scrollers. */
  blocked: boolean;
};

/**
 * Whether a touch that just started may become a back swipe.
 *
 * A tab root never can, whatever its parent looks like: the deck owns those
 * gestures, and two recognisers on one screen would fight. The left edge
 * belongs to iOS's own back gesture (EDGE_GUARD_PX) — starting there is how the
 * system gesture gets swallowed, so it is left alone.
 */
export function canStartBackSwipe(input: BackStartInput): boolean {
  if (!input.parent) return false;
  if (exactTabIndex(input.path) >= 0) return false;
  if (input.touches !== 1) return false;
  if (!input.guardOpen) return false;
  if (input.blocked) return false;
  return !isEdgeBackZone(input.clientX);
}

/** The axis a back drag has settled on, once it has travelled far enough. */
export function backAxis(dx: number, dy: number): GestureAxis {
  return classifyAxis(dx, dy);
}

/**
 * True when releasing at `offset` should go back.
 *
 * A back drag is one-directional (rightward), so a leftward offset never
 * commits. Past that, the deck's rule applies unchanged: more than 15% of the
 * width, or a flick (tabCommitDirection's distance + recent-speed test).
 */
export function backCommits(
  offset: number,
  width: number,
  recentDx: number,
  dtMs: number,
  distance = Math.abs(offset),
): boolean {
  if (!(offset > 0)) return false;
  return tabCommitDirection(offset, width, recentDx, dtMs, distance) !== 0;
}

/**
 * How long the outgoing page takes to leave once the release commits: the
 * distance still to travel at the release speed, inside the deck's 220–340 ms
 * settle bounds.
 */
export function backOutMs(offset: number, width: number, velocity: number): number {
  const travelled = Number.isFinite(offset) ? Math.min(Math.max(0, offset), width) : 0;
  return settleDuration(Math.max(0, width - travelled), width, velocity);
}

/**
 * How long the parent screen takes to slide in from the left. A faster release
 * reads as a quicker arrival, so the entrance shortens with it — the same
 * speed-to-duration shape as settleDuration, bounded to 180–300 ms.
 */
export function backEnterMs(velocity: number): number {
  const speed = Number.isFinite(velocity) ? Math.abs(velocity) : 0;
  const t = Math.min(1, Math.max(0, speed / BACK_ENTER_SPEED));
  return Math.round(BACK_ENTER_MAX_MS - (BACK_ENTER_MAX_MS - BACK_ENTER_MIN_MS) * t);
}
