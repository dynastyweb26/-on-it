'use client';
// A deck tab's scroll container that remembers where it was. The deck unmounts
// when a nested route (an invoice, a Settings sub-screen) is open, so without
// this, coming back mounts a fresh panel at the top.
//
// The position lives in lib/tab-scroll, keyed per tab AND per filter, and the
// restore keeps waiting while the list is still short — on return the first
// paint is a skeleton or a few cached rows, and the rest can land late.
import { useEffect, useLayoutEffect, useRef } from 'react';
import {
  readSavedScroll, restoreScrollTop, saveScroll, tabScrollKey,
} from '@/lib/tab-scroll';

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export default function TabScroller({ index, className, children }: {
  index: number;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // True while a restore is driving scrollTop; saves are ignored then so a
  // clamped value never overwrites the real position.
  const restoring = useRef(false);

  const keyNow = () =>
    tabScrollKey(index, typeof window === 'undefined' ? '' : window.location.search);

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = readSavedScroll(keyNow());
    if (target <= 0) return;
    restoring.current = true;
    const cancel = restoreScrollTop(el, target, {
      now: () => performance.now(),
      raf: (cb) => requestAnimationFrame(cb),
      cancel: (id) => cancelAnimationFrame(id),
      cancelled: () => !restoring.current,
      onDone: () => { restoring.current = false; },
    });
    return cancel;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  return (
    <div
      ref={ref}
      data-tab-scroll-owner=""
      className={className}
      onScroll={(e) => {
        if (!restoring.current) saveScroll(keyNow(), e.currentTarget.scrollTop);
      }}
      onTouchStart={() => { restoring.current = false; }}
      onWheel={() => { restoring.current = false; }}
    >
      {children}
    </div>
  );
}
