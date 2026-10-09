'use client';
// The contract between the story player and its slides (RECAP-SPEC §2 "one
// clock"). The player owns a single requestAnimationFrame loop and advances
// each slide's clock; a slide registers `seek(t)` handlers (WAAPI currentTime,
// count-ups) instead of re-rendering per frame. Animations are created paused
// and only ever positioned by t, so pause / replay / scrub are exact.
import { useEffect, useLayoutEffect, useRef } from 'react';
import type { SlideTiming } from '@/lib/recap/timing';
import type { RecapPayload } from '@/lib/recap/payload';

export type SlideClock = {
  /** Current slide time in ms (0 … duration). */
  t: number;
  subscribe: (fn: (t: number) => void) => () => void;
  /** Called by the player only. */
  seek: (t: number) => void;
};

export function createClock(): SlideClock {
  const subs = new Set<(t: number) => void>();
  const clock: SlideClock = {
    t: 0,
    subscribe(fn) { subs.add(fn); fn(clock.t); return () => { subs.delete(fn); }; },
    seek(t) { clock.t = t; subs.forEach((fn) => fn(t)); },
  };
  return clock;
}

/** `data-act` values a slide's buttons can raise (the player routes them). */
export type RecapAction = 'view-invoices' | 'new-invoice';

export type SlideProps = {
  payload: RecapPayload;
  timing: SlideTiming;
  clock: SlideClock;
  reduced: boolean;
  index: number;
  count: number;
  /** How many times a recap story has been opened on this device (the
   *  opener's affirmation rotates on it). */
  opens: number;
  onAction: (a: RecapAction) => void;
};

