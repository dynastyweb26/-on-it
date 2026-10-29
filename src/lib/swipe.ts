// Shared swipe math for the tab deck and swipe-to-delete rows.
//
// Both surfaces lock an axis once, after a small amount of travel, and never
// change their mind mid-gesture: vertical scrolling can't turn into a swipe,
// and a swipe can't be cancelled by later vertical drift. Calls are pure, so
// the thresholds are unit-tested rather than checked on a device.

/** Total travel (px) before an axis is decided. */
export const AXIS_SLOP_PX = 10;

/**
 * |dx| must be at least this many times |dy| to count as horizontal.
 * 1.2 is roughly a ±40° cone from horizontal: wide enough for a natural
 * one-handed thumb arc, narrow enough that a real vertical scroll (|dy| >
 * |dx|) still wins and is never hijacked.
 */
export const HORIZONTAL_RATIO = 1.2;

/** A tab navigation that never lands stops blocking new swipes after this. */
export const NAV_GUARD_MS = 3000;

/** Fraction of the viewport a tab drag must cross before it commits. */
export const TAB_COMMIT_FRACTION = 0.2;

/** A tab flick needs this much total travel and recent speed. */
export const TAB_FLICK = { minDistance: 60, minVelocity: 1.0 } as const;

/** How far the page can rubber-band past the first/last tab. */
export const EDGE_BAND_FACTOR = 0.22;

/** The pill's maximum stretch while dragging between tabs. */
export const PILL_STRETCH = 0.32;

/** How dark a page becomes at a full tab of distance from the finger. */
export const PAGE_DIM = 0.12;

/** Bounds for a drag's track settle, derived from distance and release speed. */
export const SETTLE_MIN_MS = 220;
export const SETTLE_MAX_MS = 340;

export type GestureAxis = 'pending' | 'horizontal' | 'vertical';

/**
 * Decide a gesture's axis once it has travelled far enough.
 *
 * `pending` means "not enough travel yet, ask again"; `vertical` and
 * `horizontal` are terminal for the rest of the gesture. At exactly the slop
 * and exactly the ratio the gesture counts as horizontal (>=, not >).
 */
export function classifyAxis(
  dx: number,
  dy: number,
  opts: { slop?: number; ratio?: number } = {},
): GestureAxis {
  const slop = opts.slop ?? AXIS_SLOP_PX;
  const ratio = opts.ratio ?? HORIZONTAL_RATIO;
  if (Math.hypot(dx, dy) < slop) return 'pending';
  return Math.abs(dx) >= ratio * Math.abs(dy) ? 'horizontal' : 'vertical';
}

export type FlickThreshold = {
  /** Minimum total travel for a flick (px). */
  minDistance: number;
  /** Minimum recent speed (px/ms). */
  minVelocity: number;
  /**
   * Total travel, when it differs from `dx` (the recent displacement used for
   * speed). Defaults to |dx|; callers that sample the last ~100ms pass the
   * whole gesture's distance here.
   */
  distance?: number;
};

/**
 * A flick needs both a long enough travel and a fast recent speed. `dtMs` is
 * measured over the last ~100 ms of movement, so a finger that rests before
 * lifting is not a flick however far it travelled. `dx` is the recent
 * displacement; distance defaults to it but can be supplied separately.
 */
export function isFlick(dx: number, dtMs: number, t: FlickThreshold): boolean {
  if (!Number.isFinite(dx) || !Number.isFinite(dtMs) || dtMs <= 0) return false;
  const distance = t.distance ?? Math.abs(dx);
  return distance >= t.minDistance && Math.abs(dx) / dtMs >= t.minVelocity;
}

/**
 * Resistance past the first/last tab. It starts near 1:1, then the page
 * approaches a hard stop at 22% of the viewport. `offset` keeps its sign.
 */
export function rubberBand(offset: number, width: number, maxFactor = EDGE_BAND_FACTOR): number {
  if (!Number.isFinite(offset) || !Number.isFinite(width) || width <= 0) return 0;
  const max = maxFactor * width;
  if (max <= 0) return 0;
  const sign = Math.sign(offset);
  const travel = Math.abs(offset);
  return sign * max * (1 - 1 / ((travel / max) * 0.55 + 1));
}

/**
 * Apply the edge band only when the drag is pulling away from the first or
 * last page. A drag back toward the deck stays 1:1.
 */
export function applyEdgeResistance(offset: number, index: number, count: number, width: number): number {
  if (!Number.isFinite(offset) || count <= 1) return offset;
  const outward = (index <= 0 && offset > 0) || (index >= count - 1 && offset < 0);
  return outward ? rubberBand(offset, width) : offset;
}

/** The pill/page progress: 0..count-1, continuous during a drag. */
export function tabProgress(index: number, offset: number, width: number, count = 5): number {
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(offset)) return index;
  return Math.min(count - 1, Math.max(0, index - offset / width));
}

/** The page dim overlay at a continuous progress. */
export function pageDim(progress: number, pageIndex: number): number {
  return Math.min(1, Math.abs(progress - pageIndex)) * PAGE_DIM;
}

/**
 * Track settle time for a release. Remaining travel sets the base (a nearly
 * finished drag is quick; a full-page commit is slower); release speed trims
 * up to 90 ms. Clamped to 220–340 ms so the deck always feels responsive.
 */
export function settleDuration(distancePx: number, width: number, velocity: number): number {
  const validWidth = Number.isFinite(width) && width > 0;
  const travelled = Number.isFinite(distancePx) ? Math.abs(distancePx) : 0;
  const ratio = validWidth ? Math.min(1, travelled / width) : 0;
  const speed = Math.min(1, Math.max(0, (Number.isFinite(velocity) ? Math.abs(velocity) : 0) / 1.5));
  return Math.round(
    Math.min(SETTLE_MAX_MS, Math.max(SETTLE_MIN_MS, SETTLE_MIN_MS + (SETTLE_MAX_MS - SETTLE_MIN_MS) * ratio - 90 * speed)),
  );
}

/**
 * Finger travel since the horizontal lock. Using the lock point as the origin
 * (rather than always subtracting a fixed slop) means a fast first touchmove
 * cannot snap the track by `dx - slop`; the page starts moving from where the
 * axis was decided.
 */
export function dragFromLock(dx: number, lockDx: number): number {
  const current = Number.isFinite(dx) ? dx : 0;
  const lock = Number.isFinite(lockDx) ? lockDx : 0;
  return current - lock;
}

/** The pill's scaleX while the finger is down; 1 at a tab centre. */
export function pillStretch(progress: number): number {
  if (!Number.isFinite(progress)) return 1;
  const frac = progress - Math.floor(progress);
  return 1 + PILL_STRETCH * Math.sin(Math.PI * frac);
}

/**
 * The direction a release should commit to: -1 previous, +1 next, 0 spring
 * back. Distance wins; otherwise a recent flick in the same direction as the
 * drag. `recentDx` is the last ~100ms of travel and `dtMs` its duration.
 */
export function tabCommitDirection(
  offset: number,
  width: number,
  recentDx: number,
  dtMs: number,
  distance = Math.abs(offset),
): -1 | 0 | 1 {
  if (!Number.isFinite(offset) || offset === 0 || !Number.isFinite(width) || width <= 0) return 0;
  const dir: -1 | 1 = offset < 0 ? 1 : -1;
  if (Math.abs(offset) > TAB_COMMIT_FRACTION * width) return dir;
  if (Math.sign(recentDx) !== Math.sign(offset)) return 0;
  return isFlick(recentDx, dtMs, { ...TAB_FLICK, distance }) ? dir : 0;
}

/** Linear interpolation between measured tab centres. */
export function pillCentreAt(
  progress: number,
  centres: readonly { x: number; y: number }[],
): { x: number; y: number } {
  if (centres.length === 0) return { x: 0, y: 0 };
  const p = Math.min(centres.length - 1, Math.max(0, progress));
  const lo = Math.floor(p);
  const hi = Math.min(centres.length - 1, lo + 1);
  const t = p - lo;
  return {
    x: centres[lo].x + (centres[hi].x - centres[lo].x) * t,
    y: centres[lo].y + (centres[hi].y - centres[lo].y) * t,
  };
}
