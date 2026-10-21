// Shared swipe math for the tab bar and swipe-to-delete rows.
//
// Both surfaces lock an axis once, after a small amount of travel, and never
// change their mind mid-gesture: vertical scrolling can't turn into a swipe,
// and a swipe can't be cancelled by later vertical drift. Calls are pure, so
// the thresholds are unit-tested rather than checked on a device.

/** Total travel (px) before an axis is decided. */
export const AXIS_SLOP_PX = 12;

/** |dx| must be at least this many times |dy| to count as horizontal. */
export const HORIZONTAL_RATIO = 2.5;

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
