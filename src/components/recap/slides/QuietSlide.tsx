'use client';
// The "nothing at all" recap (RECAP-SPEC §5 "quiet"; the prototype's
// slides.js quiet): a single gentle card — the app icon, "Quiet week." /
// "Ready when you are." and "Make an invoice". No cues, no story beyond the
// close button. (Such a period gets no push and no prompt — recapAnnounces —
// but it can still be opened from the Books card / history.)
//
// Reduce Motion: the card fades in.
import { useRef } from 'react';
import { useSlideAnims } from '@/components/recap/anim';
import type { SlideProps } from '@/components/recap/clock';
import { per } from '@/components/recap/copy';
import { fitContent } from '@/components/recap/fit';

export default function QuietSlide({ payload: d, timing, clock, reduced, onAction }: SlideProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  useSlideAnims(clock, timing.B, reduced, (S) => {
    fitContent(boxRef.current);
    S.fadeUp(cardRef.current, 'card', { dy: 20 });
  });
  const p = per(d);
  return (
    <div className="absolute inset-0">
      <div ref={boxRef} className="rc-content rc-quiet">
        <div className="rc-spacer" />
        <div ref={cardRef} className="rc-quiet-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/apple-icon-180.png" alt="On It" width={72} height={72} />
          <h2 className="rc-h2" style={{ marginTop: 28 }}>Quiet {p}.</h2>
          <p className="rc-body" style={{ marginTop: 10 }}>Ready when you are.</p>
          <button type="button" className="rc-btn" data-act="new-invoice" onClick={() => onAction('new-invoice')}>Make an invoice</button>
        </div>
        <div className="rc-spacer" />
      </div>
    </div>
  );
}
