'use client';
import { useEffect, useState } from 'react';

/**
 * Delay a loading affordance so it only appears when the wait is real.
 *
 * Skeletons that appear for 80ms and vanish read as a flicker. Callers pass
 * their loading flag and get `false` until it has been true for `ms` (300 by
 * default); if the data lands inside that window, the skeleton never renders.
 * A fast return to not-loading cancels the timer, so a later load starts its
 * own delay.
 */
export function useDelayedShow(loading: boolean, ms = 300): boolean {
  const [elapsed, setElapsed] = useState(false);
  useEffect(() => {
    if (!loading) {
      setElapsed(false);
      return;
    }
    const t = setTimeout(() => setElapsed(true), ms);
    return () => clearTimeout(t);
  }, [loading, ms]);
  return loading && elapsed;
}
