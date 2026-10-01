'use client';
// The receipt photo as a chat message on the user's side (MOTION-SPEC §8,
// board "05 · Receipt capture"). It stays in the thread and scrolls like any
// other message.
//
// Live capture (animate): once the image has decoded and the shutter flash has
// played, a full-bleed copy of the photo shrinks into the bubble's place
// (460ms, --ease-emphasized) and crossfades into the rounded bubble, so the
// corners read as 0 → 16px without animating border-radius (transform and
// opacity only). The copy lives on <body> so the list's overflow can't clip it.
// If decode fails, or reduced motion is on, the bubble just appears. Restored
// messages never animate (the caller only passes `animate` for a live one).
import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/Icon';
import { markMotion } from '@/lib/motion-debug'; // TEMP motion diagnosis — REMOVE BEFORE MERGE

const DURATION = 460;
const EASE_EMPHASIZED = 'cubic-bezier(.65, 0, .35, 1)'; // --ease-emphasized

export default function ReceiptBubble({ src, animate = false, startAt = 0 }: {
  src: string;
  /** Play the capture flight (a live capture only). */
  animate?: boolean;
  /** performance.now() before which the flight must not start (the flash). */
  startAt?: number;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  // Hidden only while a live flight is pending; everything else shows at once.
  const [hidden, setHidden] = useState(animate);

  useEffect(() => {
    if (!animate) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { setHidden(false); return; }
    let cancelled = false;
    let overlay: HTMLDivElement | null = null;
    (async () => {
      const img = imgRef.current;
      const box = boxRef.current;
      if (!img || !box) { setHidden(false); return; }
      try {
        await img.decode();
      } catch {
        markMotion('receipt-bubble', 'decode failed — shown static');
        if (!cancelled) setHidden(false);
        return;
      }
      const wait = startAt - performance.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      if (cancelled) return;

      const r = box.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      // Start: the bubble's box scaled to the full viewport width, centred.
      const s = vw / r.width;
      const tx = vw / 2 - (r.left + r.width / 2);
      const ty = vh / 2 - (r.top + r.height / 2);

      overlay = document.createElement('div');
      Object.assign(overlay.style, {
        position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`,
        zIndex: '55', pointerEvents: 'none', overflow: 'hidden', willChange: 'transform, opacity',
      });
      const copy = document.createElement('img');
      copy.src = src;
      copy.alt = '';
      Object.assign(copy.style, { width: '100%', height: '100%', objectFit: 'cover', display: 'block' });
      overlay.appendChild(copy);
      document.body.appendChild(overlay);

      markMotion('receipt-bubble start', `decoded=true on-screen=${r.bottom > 0 && r.top < vh} top=${Math.round(r.top)}`);
      setHidden(false);
      const fly = overlay.animate(
        [
          { transform: `translate(${tx}px, ${ty}px) scale(${s})`, opacity: 1 },
          { opacity: 1, offset: 0.7 },
          { transform: 'none', opacity: 0 },
        ],
        { duration: DURATION, easing: EASE_EMPHASIZED, fill: 'forwards' },
      );
      box.animate(
        [{ opacity: 0 }, { opacity: 0, offset: 0.6 }, { opacity: 1 }],
        { duration: DURATION, easing: 'linear' },
      );
      try { await fly.finished; } catch { /* cancelled */ }
      markMotion('receipt-bubble end');
      overlay.remove();
      overlay = null;
    })();
    return () => { cancelled = true; overlay?.remove(); };
    // Runs once per mount: a live bubble plays once, a re-render never replays it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // An older bubble whose image wasn't kept in storage (chat/page forStorage).
  if (!src) {
    return (
      <div className="flex justify-end">
        <div className="flex items-center gap-1.5 rounded-card rounded-br-md bg-primary-container px-4 py-3 text-body-md text-on-primary-container">
          <Icon name="receipt_long" size={18} /> Receipt photo
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-end">
      <div
        ref={boxRef}
        className="w-[132px] overflow-hidden rounded-[16px] rounded-br-md border border-outline-variant/40 bg-surface-container shadow-card"
        style={hidden ? { opacity: 0 } : undefined}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={imgRef} src={src} alt="Receipt photo" className="block h-auto w-full" />
      </div>
    </div>
  );
}
