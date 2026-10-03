// The OS "Reduce Motion" setting, live. Shared by components that drive motion
// from JS (WAAPI, rAF, carousels), which the global CSS kill switch
// (globals.css, prefers-reduced-motion) doesn't reach. CSS-only motion needs
// nothing: the kill switch already lands it on its static state.
import { useEffect, useState } from 'react';

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}
