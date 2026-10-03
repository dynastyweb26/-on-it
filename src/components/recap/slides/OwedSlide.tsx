'use client';
// Slide 5 — Still on the table (RECAP-SPEC §5 "owed"; the prototype's
// slides.js owed), dark: "Still owed to you" + the total counting up, the
// invoice count; up to three invoice cards (largest first) slide in, the rest
// as up to six stacked edges under the last card and a "+N more" pill; the
// "N clients opened their invoice…" / "N quotes waiting…" lines; the gold
// "View invoices" button and the closing line.
//
// Decision (RECAP-SPEC §0b): no "Send reminders" — On It sends nothing to
// clients itself; "View invoices" (the unpaid list) is the gold button.
//
// Reduce Motion: fades only, final total.
import { useRef } from 'react';
import { useSlideAnims } from '@/components/recap/anim';
import type { SlideProps } from '@/components/recap/clock';
import { money, per, plural, shortDate } from '@/components/recap/copy';
import { fitContent, fitText } from '@/components/recap/fit';

const CH = 60, CG = 6;   // card height / gap

export default function OwedSlide({ payload: d, timing, clock, reduced, onAction }: SlideProps) {
  const full = d.owed.invoices.slice(0, 3);
  const n = d.owed.count;
  const rest = Math.max(0, n - full.length);
  const layers = Math.min(6, rest);
  const lastTop = Math.max(0, full.length - 1) * (CH + CG);
  const H = full.length ? lastTop + CH + layers * 5 + (rest ? 48 : 0) : 0;
  const vu = d.viewedUnpaid, q = d.quotesPending;

  const boxRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const leadRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const capRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const edgeRefs = useRef<(HTMLDivElement | null)[]>([]);
  const moreRef = useRef<HTMLDivElement>(null);
  const linesRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef<HTMLDivElement>(null);

  useSlideAnims(clock, timing.B, reduced, (S) => {
    fitText(heroRef.current, money(d.owed.total));
    fitContent(boxRef.current);
    S.fadeUp(labelRef.current, 'label');
    S.fadeUp(leadRef.current, 'lead');
    S.number(heroRef.current, d.owed.total, 'count', money);
    S.fadeUp(capRef.current, 'countcap', { dy: 6 });
    cardRefs.current.forEach((c, i) => S.anim(c, [{ opacity: 0, transform: `translate(48px,-6px) rotate(${4 + i * 2}deg)` }, { opacity: 1, transform: 'none' }], 'cards', { i }));
    edgeRefs.current.forEach((e, i) => S.anim(e, [{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }], 'edges', { i }));
    S.pop(moreRef.current, 'more');
    S.fadeUp(linesRef.current, 'lines');
    S.fadeUp(ctaRef.current, 'cta', { dy: 14 });
    S.fadeUp(closingRef.current, 'closing');
  });

  return (
    <div className="absolute inset-0">
      <div ref={boxRef} className="rc-content">
        <div ref={labelRef} className="rc-label">Still on the table</div>
        <div ref={leadRef} className="rc-lead">Still owed to you</div>
        <div ref={heroRef} className="rc-hero rc-hero-76">{money(reduced ? d.owed.total : 0)}</div>
        <div ref={capRef} className="rc-countcap">{plural(n, 'invoice', 'invoices')}</div>
        <div className="rc-stack" style={{ height: H }}>
          {Array.from({ length: layers }, (_, j) => (
            <div
              key={`e${j}`}
              ref={(el) => { edgeRefs.current[j] = el; }}
              className="rc-oedge"
              style={{ top: lastTop + (j + 1) * 5, left: (j + 1) * 7, right: (j + 1) * 7, zIndex: 5 - j, background: `hsl(36,${30 - j * 2}%,${80 - j * 7}%)` }}
            />
          ))}
          {full.map((x, i) => (
            <div key={i} ref={(el) => { cardRefs.current[i] = el; }} className="rc-ocard" style={{ top: i * (CH + CG), zIndex: 10 - i }}>
              <div>
                <b>{x.client}</b>
                <span><i style={{ background: x.status === 'viewed' ? 'var(--onit-gold-text)' : 'var(--onit-muted-dot)' }} />{x.status === 'viewed' ? 'Viewed' : 'Sent'} · {shortDate(x.date)}</span>
              </div>
              <strong>{money(x.amount)}</strong>
            </div>
          ))}
          {rest > 0 && (
            <div ref={moreRef} className="rc-more" style={{ top: lastTop + CH + layers * 5 + 12 }}>
              <span>+{rest} more</span>
            </div>
          )}
        </div>
        {(vu > 0 || q > 0) && (
          <div ref={linesRef} className="rc-lines">
            {vu > 0 && <div><b>{vu}</b><span>{vu === 1 ? 'client opened their invoice but hasn’t paid yet.' : 'clients opened their invoice but haven’t paid yet.'}</span></div>}
            {q > 0 && <div><b>{q}</b><span>{q === 1 ? 'quote' : 'quotes'} waiting on an answer.</span></div>}
          </div>
        )}
        <div className="rc-spacer" />
        <div ref={ctaRef} className="rc-cta">
          <button type="button" className="rc-btn" data-act="view-invoices" onClick={() => onAction('view-invoices')}>View invoices</button>
        </div>
        <div ref={closingRef} className="rc-closing">Go get it this {per(d)}.</div>
      </div>
    </div>
  );
}
