// Closing the full-screen photo viewer with a drag: the pure half.
//
// The viewer has one exit control on screen — the back arrow (ViewerBackButton)
// — and, at the first photo, one gesture: a rightward drag. It follows the
// finger and slides the viewer away when the release commits, springs back
// otherwise. Which gesture a touch becomes is decided at the axis lock, never at
// touchstart, so a tap on a chevron or on the image still clicks.
//
// Nothing here is retuned. Axis slop, commit distance and settle bounds all come
// from lib/swipe.ts, exactly like the tab deck and the nested back swipe, so a
// future retune reaches this gesture too.
//
// Pure on purpose: every decision below is unit-tested (photo-dismiss.test.ts)
// rather than checked on a device. The DOM half — listeners, transform, settle —
// is components/estimate/PhotoViewer.tsx.
import { classifyAxis, settleDuration, tabCommitDirection, type GestureAxis } from './swipe';

/** The axis a viewer drag has settled on once it has travelled far enough. */
export function photoDismissAxis(dx: number, dy: number): GestureAxis {
  return classifyAxis(dx, dy);
}

/**
 * Whether a horizontal drag is the dismissal.
 *
 * Only rightward, and only at the first photo: leftward is the next photo, and a
 * rightward drag at any later photo is still the previous one. Both of those
 * keep the 40px rule the stage has always had.
 */
export function photoDismissStarts(index: number, dx: number, axis: GestureAxis): boolean {
  return axis === 'horizontal' && index === 0 && dx > 0;
}

/**
 * True when releasing at `offset` should close the viewer.
 *
 * A leftward offset never commits — that drag belongs to photo navigation. With
 * a single photo there is nothing else to swipe to, so any rightward travel is
 * enough. With several, the deck's rule applies: past 15% of the width, or a
 * flick (tabCommitDirection's distance + recent-speed test).
 */
export function photoDismissCommits(
  offset: number,
  width: number,
  recentDx: number,
  dtMs: number,
  count = 1,
): boolean {
  if (!(offset > 0)) return false;
  if (count <= 1) return true;
  return tabCommitDirection(offset, width, recentDx, dtMs, offset) !== 0;
}

/** How long the viewer takes to leave: the distance still to travel, 220–340 ms. */
export function photoDismissOutMs(offset: number, width: number, velocity: number): number {
  const travelled = Number.isFinite(offset) ? Math.min(Math.max(0, offset), width) : 0;
  return settleDuration(Math.max(0, width - travelled), width, velocity);
}

/** How long an early release takes to spring back to rest. */
export function photoDismissSpringMs(offset: number, width: number, velocity: number): number {
  return settleDuration(offset, width, velocity);
}
