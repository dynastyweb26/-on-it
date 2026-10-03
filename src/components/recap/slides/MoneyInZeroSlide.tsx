'use client';
// Slide 2 (variant) — Money in, $0 period (RECAP-SPEC §5 "moneyInZero"; the
// prototype's slides.js moneyInZero), light and calm: "Quiet week on
// payments." / "Your invoices are still working. N are out there." (or
// "Nothing came in this time."); up to three open invoices slide in as white
// rows (client, Viewed/Sent, amount); "Out there · N more" + the total
// counting up. Ticks only — no chime.
//
// Reduce Motion: fades only, final total.
import { useRef } from 'react';
import { useSlideAnims } from '@/components/recap/anim';
import type { SlideProps } from '@/components/recap/clock';
import { money, per } from '@/components/recap/copy';
import { fitContent } from '@/components/recap/fit';

export default function MoneyInZeroSlide({ payload: d, timing, clock, reduced }: SlideProps) {
  const top = d.owed.invoices.slice(0, 3);
  const n = d.owed.count;
  const more = Math.max(0, n - top.length);

  const boxRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const bodyRef = useRef<HTMLParagraphElement>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const totalRef = useRef<HTMLDivElement>(null);
  const numRef = useRef<HTMLElement>(null);

  useSlideAnims(clock, timing.B, reduced, (S) => {
    fitContent(boxRef.current);
    S.fadeUp(labelRef.current, 'label');
    S.fadeUp(titleRef.current, 'title', { dy: 16 });
    S.fadeUp(bodyRef.current, 'body');
    rowRefs.current.forEach((r, i) => S.anim(r, [{ opacity: 0, transform: 'translateX(-28px)' }, { opacity: 1, transform: 'none' }], 'rows', { i }));
    if (n) {
      S.fadeUp(totalRef.current, 'total', { dur: 400 });
      S.number(numRef.current, d.owed.total, 'total', money);
    }
  });

  return (
    <div className="absolute inset-0">
      <div ref={boxRef} className="rc-content">
        <div ref={labelRef} className="rc-label">Money in</div>
        <h2 ref={titleRef} className="rc-h2">Quiet {per(d)} on payments.</h2>
        <p ref={bodyRef} className="rc-body">
          {n ? `Your invoices are still working. ${n} ${n === 1 ? 'is' : 'are'} out there.` : 'Nothing came in this time.'}
        </p>
        {top.length > 0 && (
          <div className="rc-lrows">
            {top.map((x, i) => (
              <div key={i} ref={(el) => { rowRefs.current[i] = el; }} className="rc-lrow">
                <span>{x.client}</span>
                <em style={{ ['--c' as string]: x.status === 'viewed' ? 'var(--onit-gold)' : 'var(--onit-muted-dot)' }}><i />{x.status === 'viewed' ? 'Viewed' : 'Sent'}</em>
                <b>{money(x.amount)}</b>
              </div>
            ))}
          </div>
        )}
        {n > 0 && (
          <div ref={totalRef} className="rc-oz">
            <span>Out there{more ? ` · ${more} more` : ''}</span>
            <b ref={numRef}>{money(reduced ? d.owed.total : 0)}</b>
          </div>
        )}
      </div>
    </div>
  );
}
