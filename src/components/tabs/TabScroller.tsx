'use client';
// A deck tab's scroll container that remembers where it was. The deck unmounts
// when a nested route (an invoice, a Settings sub-screen) is open, so without
// this, coming back mounts a fresh panel at the top. The position lives at
// module level (survives client navigation, resets on a full reload) and is
// restored once the content is tall enough to scroll there; tabs that load
// their list after mount get a short retry window.
import { useEffect, useLayoutEffect, useRef } from 'react';

const positions = new Map<number, number>();
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;
const RESTORE_MS = 1500;

export default function TabScroller({ index, className, children }: {
  index: number;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const restoring = useRef(true);

  useIsoLayoutEffect(() => {
    const el = ref.current;
    const target = positions.get(index) ?? 0;
    if (!el || target <= 0) { restoring.current = false; return; }
    const start = performance.now();
    let raf = 0;
    const tick = () => {
      el.scrollTop = target;
      // Done once it landed (within a pixel) or the window ran out; a user
      // scroll during the window also ends it (see onScroll).
      if (!restoring.current || Math.abs(el.scrollTop - target) < 2 || performance.now() - start > RESTORE_MS) {
        restoring.current = false;
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [index]);

  return (
    <div
      ref={ref}
      data-tab-scroll-owner=""
      className={className}
      onScroll={(e) => {
        // Writes from the restore loop must not overwrite the saved position
        // with a clamped value; once restoring ends, every scroll is saved.
        if (!restoring.current) positions.set(index, e.currentTarget.scrollTop);
      }}
      onTouchStart={() => { restoring.current = false; }}
      onWheel={() => { restoring.current = false; }}
    >
      {children}
    </div>
  );
}
