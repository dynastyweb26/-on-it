'use client';
// The sticky "Record payment" bar above the real bottom tab bar (invoice detail
// redesign). It never edits the shell: it measures the app's <main> and the
// existing [data-coach="tab-bar"] and pins itself to the content area, sitting
// directly above the tab bar (safe area included in that height). Hiding on the
// OS keyboard matches the tab bar's own data-kb-hide.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/components/Icon';

export default function RecordPaymentBar({ amount, onOpen }: { amount: string; onOpen: () => void }) {
  const [box, setBox] = useState<{ left: number; right: number; bottom: number } | null>(null);

  useEffect(() => {
    const main = document.querySelector('main');
    const nav = document.querySelector('[data-coach="tab-bar"]');
    const measure = () => {
      const m = main?.getBoundingClientRect();
      if (!m) return;
      const n = nav?.getBoundingClientRect();
      setBox({
        left: m.left,
        right: Math.max(0, window.innerWidth - m.right),
        bottom: n && n.height > 0 ? n.height : 0,
      });
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (ro) { if (main) ro.observe(main); if (nav) ro.observe(nav); }
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
      ro?.disconnect();
    };
  }, []);

  if (!box) return null;

  return createPortal(
    <div data-kb-hide className="fixed z-[70]" style={{ left: box.left, right: box.right, bottom: box.bottom }}>
      <div className="border-t border-outline-variant/40 bg-background/95 px-4 pb-2.5 pt-2.5 backdrop-blur">
        <button
          type="button"
          onClick={onOpen}
          className="flex min-h-touch w-full items-center justify-between gap-2 rounded-[16px] bg-primary-container px-4 py-2 text-left text-on-background shadow-[0_8px_18px_-10px_rgba(140,100,0,.7)] transition active:scale-[0.985]"
        >
          <span className="flex items-center gap-2.5 text-[17px] font-bold">
            <Icon name="add" size={20} /> Record payment
          </span>
          <span className="shrink-0 rounded-xl bg-on-background/10 px-3 py-2 font-display text-[15px] font-bold tabular-nums">
            {amount} due
          </span>
        </button>
      </div>
    </div>,
    document.body,
  );
}
