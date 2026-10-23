'use client';
// The gold "Convert to Invoice" bar for a SIGNED quote (Phase 2). It mirrors
// RecordPaymentBar's placement: pinned to the app's <main>, above the real tab
// bar, and hidden with the OS keyboard. A sent-but-unsigned quote keeps the
// outlined chip in the card instead.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/components/Icon';

export default function ConvertQuoteBar({ converting, onConvert }: {
  converting: boolean;
  onConvert: () => void;
}) {
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
          disabled={converting}
          onClick={onConvert}
          className="flex min-h-touch w-full items-center justify-center gap-2 rounded-[16px] bg-primary-container px-4 py-2 text-[16px] font-bold text-on-background shadow-[0_8px_18px_-10px_rgba(140,100,0,.7)] transition active:scale-[0.985] disabled:opacity-60"
        >
          <Icon name="sync" size={20} /> {converting ? 'Converting…' : 'Convert to Invoice'}
        </button>
      </div>
    </div>,
    document.body,
  );
}
