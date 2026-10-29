'use client';
// A deck tab's scroll container that remembers where it was. The deck unmounts
// when a nested route (an invoice, a Settings sub-screen) is open, so without
// this, coming back mounts a fresh panel at the top.
//
// The position is remembered as the ROW at the top plus its offset (see
// lib/tab-scroll), not just a pixel count: rows are content-visibility measured
// at 88px until painted while a real row is ~105px, so a deep offset in a long
// list can be unreachable by number even though the row is right there.
import { useEffect, useLayoutEffect, useRef } from 'react';
import {
  anchorAt, anchorOffset, readSavedAnchor, readSavedScroll, registerTabFilter,
  restoreScrollTop, saveScroll, tabScrollKey, type RowRect,
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

  /** Rows currently laid out, measured from the top of the scroll content. */
  const measure = (el: HTMLElement): RowRect[] => {
    const box = el.getBoundingClientRect().top;
    return Array.from(el.querySelectorAll<HTMLElement>('[data-scroll-anchor]')).map((node) => ({
      id: node.dataset.scrollAnchor ?? '',
      top: node.getBoundingClientRect().top - box + el.scrollTop,
    })).filter((r) => r.id !== '');
  };

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const key = keyNow();
    const saved = readSavedScroll(key);
    const anchor = readSavedAnchor(key);
    if (saved <= 0 && !anchor) return;
    restoring.current = true;
    const cancel = restoreScrollTop(el, () => {
      if (anchor) {
        const at = anchorOffset(measure(el), anchor);
        if (at !== null) return at;
      }
      return saved;
    }, {
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
        if (restoring.current) return;
        const el = e.currentTarget;
        saveScroll(keyNow(), el.scrollTop, anchorAt(measure(el), el.scrollTop));
      }}
      onTouchStart={() => { restoring.current = false; }}
      onWheel={() => { restoring.current = false; }}
    >
      {children}
    </div>
  );
}
