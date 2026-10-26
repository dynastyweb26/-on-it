'use client';
// Steps 1 and 2 of the paywall are single full-screen pages, never scrollers.
// Their content is built at a natural height (the 432px demo panel, the trial
// timeline); on a phone whose visible area is shorter than that (browser bars,
// small screens) the whole step is scaled down uniformly to fit instead of
// being cut off. The step is laid out at (100 / scale)% width, so after the
// scale it still spans the full width. A taller screen (the installed app)
// stays at scale 1.
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** Never shrink past this: below it the copy stops being readable. */
const MIN_SCALE = 0.6;

export default function FitToHeight({ children }: { children: ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    function fit() {
      if (!outer || !inner) return;
      const avail = outer.clientHeight;
      const natural = inner.offsetHeight; // layout height, unaffected by the transform
      if (!avail || !natural) return;
      const next = natural > avail ? Math.max(MIN_SCALE, avail / natural) : 1;
      setScale((prev) => (Math.abs(prev - next) < 0.004 ? prev : next));
    }

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(outer);
    ro.observe(inner);
    window.addEventListener('orientationchange', fit);
    return () => {
      ro.disconnect();
      window.removeEventListener('orientationchange', fit);
    };
  }, []);

  return (
    <div ref={outerRef} className="min-h-0 flex-1 overflow-hidden">
      <div
        ref={innerRef}
        style={{
          width: `${100 / scale}%`,
          transform: scale === 1 ? undefined : `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        {children}
      </div>
    </div>
  );
}
